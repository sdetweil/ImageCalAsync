"use strict";
//const {ipcRenderer} = require('electron');
var MongoClient = require("mongodb").MongoClient;
//var e2c = require('electron-to-chromium');
const path = require("path");

var webserver = require("connect")();
var http = require("http");
var swaggerTools = require("swagger-tools");
var jsyaml = require("js-yaml");
var fsc = require("fs");
var serverPort = 8099;

var common = require(path.resolve( __dirname , "plugins", "ImageCal", "ImageScheduler", "common"))
//var ObjectId = require("mongodb").ObjectId;
var MongoWatch = require("mongo-watch")
const OperationDelete="d";

var cr = null;
let dbData={};
dbData.ActiveViewers=[]
dbData.ActiveDataSources=[]
dbData.Images=[]
dbData.Tags=[]
dbData.valid=false;

var resolvers={};
var modules={"file":null,"DropBox":null,"GoogleDrive":null,"OneDrive":null};

var FilePrefix="foo://"
var DropBoxPrefix = "dropbox://"
var DrivePrefix="gdrive://"

var inprogress=false;

//	var dateFormat = require('dateformat');
var dgram = require("dgram");
var glob = require("glob")

var watcher;
var pebusy = false;
var dbx = null;
var drive=null;
var vdb = null;
let waiting = false;

// swaggerRouter configuration
var options = {
	swaggerUi: "/swagger.json",
	controllers: path.resolve(__dirname , "plugins", "ImageCal", "ImageScheduler", "config", "controllers"),
	useStubs: false //  process.env.NODE_ENV === 'development' ? true: false
};
// The Swagger document (require it, build it programmatically, fetch it from a URL, ...)
var spec = fsc.readFileSync(path.resolve(__dirname , "plugins", "ImageCal", "ImageScheduler", "config","api")+ "/swagger.yaml", "utf8");
var swaggerDoc = jsyaml.safeLoad(spec);

// Initialize the Swagger middleware
swaggerTools.initializeMiddleware(swaggerDoc,
	function (middleware) {
	// Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
		webserver.use(middleware.swaggerMetadata());

		// Validate Swagger requests
		webserver.use(middleware.swaggerValidator());

		// Route validated requests to appropriate controller
		webserver.use(middleware.swaggerRouter(options));

		// Serve the Swagger documents and Swagger UI
		webserver.use(middleware.swaggerUi());

		// Start the server
		http.createServer(webserver).listen(serverPort,
			function () {
				// console.log('Your server is listening on port %d (http://localhost:%d)', serverPort, serverPort);
				// console.log('Swagger-ui is available on http://localhost:%d/docs', serverPort);
			});
	});

// start the discovery server
var HOST = "0.0.0.0";

var response = new Buffer("DISCOVER_MIRRORSERVER_RESPONSE:" + serverPort);
var request = "DISCOVER_MIRRORSERVER_REQUEST:";

var server = dgram.createSocket("udp4");

server.on("listening",
	function () {
		var address = server.address();
		console.log("UDP Server listening on " + address.address + ":" + address.port);
	});

server.on("message",
	function (message, remote) {
		console.log(remote.address + ":" + remote.port + " - " + message);
		var content = message.toString();
		if(content.startsWith(request)) {
			var port = content.substring(request.length);
			var net = require("net");

			var client = new net.Socket();
			console.log("connecting");

			client.connect(port, remote.address,
				function () {
					console.log("Connected");
					client.write(response);
					console.log("discovery response message sent");
					client.close = function (data) {
						var Self = this;
						console.log("closing");

						if (data)
						{this.write(data,
							function () {
								Self.destroy();
							});}
						else
						{this.destroy();}
					}
					client.close();
				});
		}
	});

server.bind(serverPort + 1, HOST);


function ImageSchedulerService($http, $interval, CalendarService, ImageService) {
	var service = {};
	var timeractive = false;
	var refresh_interval = 30; // number of seconds (5 minutes = 5*60)
	var scope;
	var dbname = config.Scheduler.MongoDBName;
	//var Providers = [];


	MongoClient.connect("mongodb://" +
			config.Scheduler.MongoDBLocation +
			":" +
			config.Scheduler.MongoPort +
			"/" +
			config.Scheduler.MongoDBName,

	function (err, db) {
		vdb = db;
		common.setdb(vdb)
		getData();
		watcher = new MongoWatch({
			format: "pretty"
		})

		watcher.watch(dbname+ ".EventViewers",
			function (event) {
				// console.log("mongo EventViewer collection event=" + event.toString());
				dbData.valid=false;
				if (event.operation == OperationDelete) {
					// console.log("shutdown any viewer that is running but deleted");
					let running = viewerRunning(ImageService.viewerList, event.data._id);
					if (running)
					// stop it
					{ImageService.cancel(running.Viewer);}
				} else {
					closeopenviewers()
					checkforviewers()
				}
			});
		watcher.watch(dbname+ ".DataSources",
			function (event) {
				// console.log("mongo DataSources collection event=" + event.toString());
				dbData.valid=false;
				if (event.operation == OperationDelete) {
					// loop thru the list of active viewers
					for (let viewerinfo of ImageService.viewerList) {
						// watch out for looping thru the list you are changing
						let list = viewerinfo.Viewer.items
						// loop thru the data items currently used, loop thru the copy
						for (let ImageItem of list) {
							// console.log("shutdown any viewer where the datasource was deleted");
							// if the source entry matches the one removed
							if (ImageItem.Source._id == event.data._id) {
								// remove this item from the list
								removeImageItemfromlist(viewerinfo.Viewer.items, ImageItem)
							}
						}
						// if there are no more things to view
						if (viewerinfo.Viewer.items.length == 0) {
							// console.log("shutdown viewer where the there are no data sources of images to show");
							// close the viewer
							ImageService.cancel(viewerinfo.Viewer);
						}
					}
				} else {
					checkforviewers()
				}
			});
		watcher.watch(dbname+ ".Tags",
			function (event) {
				dbData.valid=false;
				// console.log("mongo Tags collection event=" + event.toString());
				if (event.operation == OperationDelete) {
					// tag deleted
					// need to get all images that use that tag id,
					// loop thru all active viewers, and their imageitem list to see if there is a data source
					// that matches the datasource of the image of the removed tag
					// and if so, then shutdown that viewer..
				}
			}
		)

		watcher.watch(dbname+ ".Images",
			function (event) {
				// console.log("mongo Images collection event=" + event.toString());
				dbData.valid=false;
				if (event.operation == OperationDelete) {
					// loop thru the list of active viewers
					for (let viewerinfo of ImageService.viewerList) {
						// watch out for looping thru the list you are changing
						let list = viewerinfo.Viewer.items
						// loop thru the data items currently used, loop thru the copy
						for (let ImageItem of list) {
							// if the source entry matches the one removed
							if (ImageItem.Image._id == event.data._id) {
								// remove this item from the list
								removeImageItemfromlist(viewerinfo.Viewer.items, ImageItem)
							}
						}
						// if there are no more things to view
						if (viewerinfo.Viewer.items.length == 0) {
							// console.log("shutdown viewer where the there are no more images to show");
							// close the viewer
							ImageService.cancel(viewerinfo.Viewer);
						}
					}
				} else {
					checkforviewers()
				}
			});
	});

	function removeImageItemfromlist(list, item) {
		for (let i in  list) {
			if (list[i].Source.id === item.Source.id &&
					list[i].Image.id === item.Image.id) {
				list.splice(i, 1);
				break;
			}
		}
	}
	function closeopenviewers() {
		// remove any viewer that are open but the viewer has been marked inactive
		// loop thru the inactive viewers, if any
		vdb.collection("EventViewers").find({
			"Active": false
		}).each(
			function (err, Viewer) {
				if (Viewer != null) {
					let running = viewerRunning(ImageService.viewerList, Viewer.Name);
					if (running) {
						// stop it
						ImageService.cancel(Viewer);
					}
				}
			});
		// now remove any viewer that are open but the datasource has been marked inactive
		vdb.collection("DataSources").find({
			"Active": false
		}).toArray(
			function (err, inactiveSources) {
				if (inactiveSources.length > 0) {
					// have list of inactive sources, if any
					// loop thru runnign viewers
					ImageService.viewerList.forEach(
						function (running) {
						// loop thru any of its view items
							running.Viewer.items.forEach(
								function (ImageItem) {
									// now, for each view item, check if the source has gone inactive
									for (let Source of inactiveSources) {
										// console.log("shutdown any viewer where the datasource is now inactive");
										// if the source entry matches the one inactive
										if (ImageItem.Source._id == Source._id) {
											// stop the viewer
											ImageService.cancel(running.Viewer);
											break;
										}
									}
								});
						});
				}
			});
	}
	service.stop = function () {
		// console.log("in stop")
	}

	function containsAny(str, Tags) {
		var results = []
		for (let tag of Tags) {
			//console.log("looking for " + tag.value +" in "+str);
			if (str.toLowerCase().indexOf(tag.value.toLowerCase()) !=  - 1) {
				//console.log("found tag="+tag.value);
				results.push(tag);
			}
		}
		return results;
	}

	function worker(parm)
	{
		this.viewerinfo=parm;
	}
  
	function updatefilelist(viewerinfo) {
    
    return new Promise((resolve,reject) =>{
      //console.log("in file list callback for viewer=" + viewerinfo.Viewer.Name);
      // copy items list
      let items=viewerinfo.Viewer.items.slice();
      // loop thru all the file items
      viewerinfo.promises=[]
      items.forEach( (ImageItem) => {
        viewerinfo.promises.push(new Promise((resolve,reject) =>{
          // if the handlers haven't been loaded yet
          if(modules[ImageItem.Source.Type.Type]==null){
            // load them
            let mname=path.resolve(__dirname , "plugins", "ImageCal", "ImageScheduler")+ "/image"+ImageItem.Source.Type.Type+".js";
            modules[ImageItem.Source.Type.Type]=require(mname);
            resolvers[modules[ImageItem.Source.Type.Type].getPrefix()]=modules[ImageItem.Source.Type.Type];
          }
            // if the handler for this source type has been loaded
          if(modules[ImageItem.Source.Type.Type]!=null){
              // call it to get the file list
            //console.log("calling handler for type="+ImageItem.Source.Type.Type);
            try{
              modules[ImageItem.Source.Type.Type].listImageFiles(ImageItem,viewerinfo).then(
                  (v) =>{ 
                    c//onsole.log("resolving image list update for viewer="+v.Viewer.Name+ " Source="+ImageItem.Source.Name)
                    resolve()
                  },         
                (error)=>{
                  //console.log(" list file items promise error="+error);
                  reject(error);
                }
              )
            }
            catch(error){
              //console.log(" listimagefile error ="+error)
              reject(error);
            }
          }
        }))
      });        
      Promises.all(viewerinfo.promises).then(()=>{
         resolve(viewerinfo);
      })
      //console.log("done in updatefilelist for viewer=" + viewerinfo.Viewer.Name);
    });
	}

	function Next(viewerinfo) {
    return new Promise((resolve,reject) =>{    
      //console.log("in next for viewer="+viewerinfo.Viewer.Name);
      if (viewerinfo != null) {
        // if the next pic would be beyond the end of list
        if (viewerinfo.loadingImages==false && viewerinfo.index == -1 || (viewerinfo.images.found.length > 0 && viewerinfo.index >= viewerinfo.images.found.length)) {
          // reset the index
          viewerinfo.index = 0;
          // clear the list of images
          //console.log("clearing image list for viewer="+viewerinfo.Viewer.Name);
          viewerinfo.images.found = []
          // watch out for updated list of images
          // console.log("getting images for viewer="+viewerinfo.Viewer.Name);
          viewerinfo.loadingImages = true;    
          updatefilelist(viewerinfo).then((v)=>{
            // reset the index
            //console.log("filelist finished in then for viewer="+v.Viewer.Name)           
            v.loadingImages = false;
            // no image yet, need to cycle thru again to fixup any filenames
            resolve({viewer:v, pic:null})
          });
        }
        // send back the next image
        //console.log("image count="+viewerinfo.images.found.length+" and index="+viewerinfo.index +" for viewer="+viewerinfo.Viewer.Name)
        //console.log("loading="+viewerinfo.loading+" for viewer="+viewerinfo.Viewer.Name)

        if (viewerinfo.loading==false && viewerinfo.images.found.length > 0 && viewerinfo.index>=0 ) {
          // if the next image was loaded from the complex service
          if (typeof viewerinfo.images.loaded_image_info != "undefined") {
            let imageUrl = viewerinfo.images.loaded_image_info
            delete viewerinfo.images["loaded_image_info"]
            resolve({viewer:viewerinfo, pic:imageUrl})
          } else {
            // make sure to increment the index for the next file later
            let file = viewerinfo.images.found[viewerinfo.index];
            //console.log("=====>waiting="+waiting)
            if(waiting ==false){
              //console.log("Next has file="+file);
              if(file.includes("://"))
              {
                if(!file.startsWith("http") && !file.startsWith("file"))
                {
                  let f= file.substring(0,file.indexOf("//")+2)
                  //console.log("Next resolving image name="+file+ "for viewer="+viewerinfo.Viewer.Name+" with prefix="+f);
                  if(resolvers[f]!=null)
                  {
                    if(waiting == false){
                      //console.log("Next, needs to be resolved, file="+file)
                      waiting=true;
                      resolvers[f].resolver(file).then( (resolvedFile) => {
                        // save the resolved filename
                        viewerinfo.images.found[viewerinfo.index]=resolvedFile;
                        //console.log("resolver for " + viewerinfo.Viewer.Name +" returned "+ resolvedFile);
                        waiting=false;
                        viewerinfo.index++;
                        resolve({viewer:viewerinfo, pic:resolvedFile})
                      })
                    }
                    else {
                       resolve({viewer:viewerinfo, pic:null})
                    }
                  }
                  else{
                    //console.log("Next for viewer="+viewerinfo.Viewer.Name + " returning returning filename="+file);
                    viewerinfo.index++;
                    resolve({viewer:viewerinfo, pic:file})
                  }
                }
                else {
                  //console.log("Next for viewer="+viewerinfo.Viewer.Name + " returning http resolved filename="+file);
                  viewerinfo.index++;
                  resolve({viewer:viewerinfo, pic:file})
                }
              }
              else {
                //console.log("unexpected file type:"+file);
                reject(file)
              }
            }
            else {
              //console.log("waiting viewer ="+viewerinfo.Viewer.Name)
              resolve({viewer:viewerinfo,pic:null})
            }
          }
        }
        else {
          //console.log("no images available for viewer ="+viewerinfo.Viewer.Name)
          resolve({viewer:viewerinfo, pic:null})          
        }
      }
      //console.log("exiting next for viewer ="+viewerinfo.Viewer.Name)
    })

	}

	function viewerRunning(viewerList, Name) {
		let found = null;
		for (let v of viewerList) {
			if (typeof v.Viewer != "undefined" && (v.Viewer.Name == Name || v.Viewer._id == Name)) {
				found = v;
				break;
			}
		}
		return found;
	}

	function element(source, item)
	{
		this.Source=source;
		this.Image=item;
	}
	function getData()
	{
		if(dbData.valid==false)
		{
			console.log("loading db data");
			vdb.collection("DataSources").find({
				"Active": true
			}).toArray(
				function (err, activeSources) {
					dbData.ActiveDataSources=activeSources
					// loop thru the viewers, if any
					vdb.collection("EventViewers").find({
						"Active": true
					}).toArray(
						function (err, Viewers) {
							dbData.ActiveViewers=Viewers
							vdb.collection("Tags").find().toArray(
								function (error, tagentries) {
									dbData.Tags=tagentries
									vdb.collection("Images").find().toArray(
										function (err, items) {
											dbData.Images=items;
											dbData.valid=true;
											console.log("db data loaded");
										}
									)
								}
							)
						}
					)
				}
			)
		}
		return dbData;
	}
	function tagsfromids(ids)
	{
		let setoftags=[]
		let data = getData();
		for(let tag of data.Tags)
		{
			for(let id of ids)
			{
				//console.log("tag comparing tag id="+id +" with "+tag._id);

				if(id==tag._id)
				{
					setoftags.push(tag)
					//console.log("tag we have matching tag id="+tag._id);
					break;
				}
			}
		}
		return setoftags
	}
	function imagesfortags(tags)
	{
		let selectedimages=[]
		let data = getData();
		for(let image of data.Images)
		{
			byimage:
			for(let itag of image.Tags)
			{
				for(let tag of tags)
				{
					//console.log("image comparing image tag id="+itag +" with "+tag._id);
					if(tag._id==itag)
					{
						selectedimages.push(image)
						//console.log("image we have matching tag id="+tag._id);
						break byimage;
					}
				}
			}
		}
		return selectedimages
	}
	function processEvents(vdb, filtered_events) {
		if (pebusy == false) {
			pebusy = true;
			let data=getData();
			for (let Viewer of data.ActiveViewers) {
				if (Viewer.Tags.length > 0) {
					//// console.log(Viewer);
					//console.log("there are " + filtered_events.length + " entries in the selected cal entry data")
					let tagentries=tagsfromids(Viewer.Tags)
					let needed = false
					// is a viewer of this name running already
					let running = viewerRunning(ImageService.viewerList, Viewer.Name);
					for (let i = 0; i < filtered_events.length && needed == false; i++) {

						// get the cal entry summary
						let cal_entry_text = filtered_events[i].SUMMARY;
            //console.log("summary="+filtered_events[i].SUMMARY)
						// find any matching viewer tags in the summary
						let tags = containsAny(cal_entry_text, tagentries);
						// if we found some tags
						if (tags.length > 0) {
							//// console.log(filtered_events[i]);
							console.log("found event with tags for viewer="+Viewer	.Name);
							needed = true;
							// find any image entries with the same tags as the viewer
							let possibleimages=imagesfortags(tags)
							// loop thru the image item definitions (usually only one)
							let activeitems = []
							// loop thru each image entry
							for (let image of possibleimages) {
								for (let source of data.ActiveDataSources) {
                  //console.log("checking datasource ="+source._id.toString() + " to image datasource id="+ image.DataSource)
									if (source._id.toString() === image.DataSource) {
                    console.log("saving source="+source.Name+" and Image="+image.Name);
										activeitems.push(new element(source,image))
									}
								}
							}
							if (activeitems.length) {
								// if this viewer is not already running
								if (running == null) {
									Viewer.items = activeitems.slice();
									// start a viewer
									Viewer.next=Next;
									ImageService.startViewer(Viewer, scope)
									console.log("starting viewer Name="+Viewer.Name);

									running = 1;
									i = tagentries.length // end the loop for this viewer
								} else {
									try {
										console.log("updating viewer items list");
										// reset the images the viewer should do
										running.Viewer.items = activeitems.slice();
									} catch (ex)
									{
										// no exception allowed
									}
								}
							} // end of check for matching active data sources
						} // end if tags found
					} // end for filtered cal entries
					// if we didn't find a reason to start a viewer
					// AND
					// one is running
					if (needed == false && running != null  && running.loading==false) {
						// stop it
						ImageService.cancel(Viewer);
					}
				}
			}
			pebusy = false;
		}
	}
	function getMostDistantViewer()
	{
		let selectedViewer=null;
		let age=-1;
		let data=getData();

		for(let viewer of data.ActiveViewers)
		{
			if(viewer.Advance>age){
				age=viewer.Advance;
				selectedViewer=viewer;
			}
		}
		return selectedViewer;
	}
	function checkforviewers() {

		console.log("in timer handler")

		if (vdb != null) {
			// get the highest preview time of all the active viewers
			let doc=getMostDistantViewer()
			if (doc != null) {
				//// console.log("error="+err);
				if (typeof config.calendar.icals != "undefined") {
					console.log("getting cal entries")
					// clear the events list
					var events = [];
					// get the events from the default calendars
					CalendarService.getCalendarEvents(null, events).then(
						function () {
							//var filtered_events = [];
							// get the ones in scope (date range, and number of entries)
							var filtered_events = CalendarService.getFutureEvents(events, doc.Advance, 100);
							processEvents(vdb, filtered_events)
							events = [];
						},
						function (error) {
							// console.log(error);
						});
				}
			}
		}
	}

	// start a viewer
	service.startup = function ($scope) {
		// console.log("in ImageSchedulerService startup")
		scope = $scope
		// preload the db data

		if (timeractive == false) {
			registerRefreshInterval(checkforviewers, refresh_interval * 1000);
			timeractive = true;
		}
		ipcRenderer.on("resize-it", (event, width,height) =>{
			// console.log("ImageSchedulerService window resize new size w="+width+" h="+height)
			$scope.screen.width=width
			$scope.screen.height=height
		});
		// console.log("electron version ="+e2c.chromiumToElectron(process.versions['chrome']));
	};

	function registerRefreshInterval(callback, interval) {
		if (typeof interval !== "undefined") {
			$interval(callback, interval);
		}
	}
  
	return service;
}

angular.module("SmartMirror")
	.factory("ImageSchedulerService", ImageSchedulerService);

//}
//	()
//);
