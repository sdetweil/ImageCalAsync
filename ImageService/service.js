//const electron = require('electron');
const BrowserWindow = require("electron").remote.BrowserWindow;
const sfn=document.currentScript.src.substring(7,document.currentScript.src.lastIndexOf(path.sep))
const unhandled = require(path.resolve(sfn ,"../ImageScheduler","node_modules","electron-unhandled"));
//const log = require("electron-log");
const { webFrame } = require('electron');


(function () {
	"use strict";

	function ImageService($interval) {
		//var debug = false;
		var SCREEN_W = -1;
		var SCREEN_H = -1;
		var service = {};
		service.viewerList = [];
		service.windowlist = [];
		var refresh_interval = 1;
		//var glob = require("glob")
		var busy = false;
		//const devMode = false;
		//var mainwindow = 0;
		var timeractve = false;
		var scope = null;



		unhandled( { showDialog:false});
var loading=null;
		function valueInRange(value, min, max) {
			// send back the size to adjust or 0 if not in range (same as false)
			return ((value >= min) && (value <= max)) ? max - value : 0;
		}

		function rectOverlap(A, B) {
			// get the X overlap if any
			var xOverlap = valueInRange(A.x, B.x, B.x + B.width) ||
				valueInRange(B.x, A.x, A.x + A.width);

			// get the Y overlap if any
			var yOverlap = valueInRange(A.y, B.y, B.y + B.height) ||
				valueInRange(B.y, A.y, A.y + A.height);
			// return values, not boolean
			return {
				xdiff: xOverlap,
				ydiff: yOverlap
			};
		}
		function checkWindowOverlap(viewerinfo, new_x, new_y) {
			// setup return value if no changes required
			var info = {
				x: new_x,
				y: new_y
			}
			// assume the new wndow pos will be changed, get into the loop
			var changed = true;
			do {
				// assume position hasn't been canged
				changed = false;
				// loop thru all the windows in the list
				for (var i = 0; i < service.viewerList.length; i++) {
					// exclude the window we are calculating for
					if (service.viewerList[i].window != viewerinfo.window) {
						// console.log("processing for other window at " +service.viewerList[i].config.x+","+service.viewerList[i].config.y);
						// other window in the list for overlap detection
						var theirRect = {
							x: service.viewerList[i].config.x,
							y: service.viewerList[i].config.y,
							width: service.viewerList[i].config.width,
							height: service.viewerList[i].config.height
						}

						// retry counter
						for (var o = 1; ; o++) {
							// our window info for overlap detection
							var ourRect = {
								x: new_x,
								y: new_y,
								width: viewerinfo.config.width,
								height: viewerinfo.config.height
							}
							// get the overlap info, if any
							var diffs = rectOverlap(ourRect, theirRect);
							// console.log("diffs x="+ diffs.xdiff +" y="+diffs.ydiff)
							// if there is (either coordiante diff >0 is overlap), attempt to adjust position to prevent overlap
							if (diffs.xdiff > 0 && diffs.ydiff > 0) {
								// console.log("windows overlap");
								// if 1st or second time thru the loop
								if (o <= 1) {
									// console.log("1st time calc");
									// adjust x first (left amount to eliminate overlap)
									if (diffs.xdiff < diffs.ydiff && SCREEN_W > SCREEN_H)
									{new_x = Math.max(new_x - diffs.xdiff, 0)}
									else
									// adjust y (up amount to eliminate overlap)
									{new_y = Math.max(new_y - diffs.ydiff, 0)}
								} else {
									// console.log("NOT 1st time calc");
									if (o < 10) {
										// console.log("trying for the "+o+"th time");
										// if we tried already twice and are stuck, in the corner at 1/2 window size (x and y)
										if (new_x < viewerinfo.config.width / 2 && new_y < viewerinfo.config.height / 2) {
											// then force a wild change, middle of the screen
											new_y = SCREEN_H / 2
											new_x = SCREEN_W / 2
											// console.log("new adjustment");
										} else {
											// force one dimension to edge)
											// console.log("forcing position");
											// already left
											if (new_x == 0){
												// move up
												new_y = 0
												// console.log("force Y position = 0");
											}
											else {
												// already up, move left
												new_x = 0
												// console.log("force X position = 0");
											}
										}
									} else {
										// console.log("break out of loop, can't resolve");
										changed = false;
										break;
									}
								}
								// setup for return
								info = {
									x: new_x,
									y: new_y
								}
								// say weve changed the data from what was provided
								changed = true
								// console.log("have new position, recheck");
							} else {
								changed = false;
								// console.log("diffs 0, no overlap ");
								// diffs both 0, so no overlap
								break;
							}
						}
					}
				}
			} while (changed == true)

			return info
		}

		function loaded(viewerinfo){
			// console.log("have window to process after load");

			// resize the new window
			try {
				// console.log("window resize url="+c.viewerinfo.url);
				viewerinfo.window.webContents.executeJavaScript("if (document.images[0]) window.resizeTo(Math.min(document.images[0].width,window.innerWidth), Math.min(document.images[0].height,window.innerHeight));");
				// force repaint after resize
				viewerinfo.window.webContents.invalidate();
			} catch (ex) {
				// console.log("window resize failed="+ex);
			}


			// console.log("old window elapsed="+((Date.now()-c.viewerinfo.show)/1000)+" cycle time="+c.viewerinfo.refreshIntervalSeconds);
			// console.log("showing window now");

			// make the window visible
			viewerinfo.show = Date.now();
			if(scope.focus == "default"){
				viewerinfo.window.show()
				viewerinfo.window.focus()
			}

			viewerinfo.window.removeListener('did-finish-load',finishload)
			viewerinfo.loading=false;
			loading=null;
			viewerinfo.lastUpdate = Date.now()
			// if old window exists
			if (viewerinfo.oldwindow != null) {
				// console.log("hiding old window");
				viewerinfo.oldwindow.webContents.invalidate();
				viewerinfo.oldwindow.hide();
			}
			else {
				// console.log("old window is null");
			}

			// if old window exists
			if (viewerinfo.oldwindow != null) {
				// remove any close listeners
				viewerinfo.oldwindow.removeAllListeners("closed");
				// close it
				try {
					// console.log("closing old window");
					viewerinfo.oldwindow.close();
					viewerinfo.oldwindow=null;
				} catch (e) {
					// console.log("window close failed="+ex);
				}
			}
		}
		function finishload(){
			//console.log("window load completed, viewer="+loading.Viewer.Name+" url="+loading.url);
			//loaded(this.c);
			let t = loading
			loading=null;
			service.windowlist.push(t);
		}
		function moveWindow(image_url, viewerinfo) {

			try {
				let winsize=[]
				if(viewerinfo.window !=null){
					let window = viewerinfo.window;
					//  get the current window size
					winsize = window.getSize();
				}
				else{
					winsize=[viewerinfo.config.width,viewerinfo.config.height]
				}
				// and positionc.viewerinfo
				//var winpos  = window.getPosition();

				// calculate new window position
				let new_x = (rand() % (SCREEN_W - winsize[0] * 2)) + winsize[0];
				let new_y = (rand() % (SCREEN_H - winsize[1] * 2)) + winsize[1];
				// calculate the movement delta
				viewerinfo.dx = rand() % 2 * 2 - 1; //-1 or 1
				viewerinfo.dy = rand() % 2 * 2 - 1;

				// set new origin
				new_x += viewerinfo.dx;
				new_y += viewerinfo.dy;
				// if we are offscreen, se the next adjustments to correct
				if (new_y <= winsize[1] || new_y >= SCREEN_H - winsize[1])
				{viewerinfo.dy *= -1;}
				if (new_x <= winsize[0] || new_y >= SCREEN_W - winsize[0])
				{viewerinfo.dx *= -1;}
				// console.log("getting window position");
				// if there other windows we might overlap
				if (service.viewerList.length > 1) {
					// check and adjust the proposed new position to avoid overlap
					let info = checkWindowOverlap(viewerinfo, new_x, new_y);
					new_x = info.x;
					new_y = info.y;
				}
				// console.log("have window position");
				let wconfig = {
					width: viewerinfo.config.width,
					height: viewerinfo.config.height,
					x: new_x,
					y: new_y
				}
				// save the config
				viewerinfo.config = wconfig
				// get the current window object
				viewerinfo.oldwindow = viewerinfo.window
				viewerinfo.window=null;
				// create the window, in new position, hidden
				viewerinfo.window = new BrowserWindow({
					width: viewerinfo.config.width,
					height: viewerinfo.config.height,
					x: new_x,
					y: new_y,
					alwaysOnTop: true,
					show:false,
					transparent: true,
					backgroundColor: "#000000",
					dx: 0,
					dy: 0,
					frame: false,
					skipTaskbar: true
					//title:viewerinfo.Viewer.Name
				})
				// console.log("window created");
				// setup handler for when window is ready to show
				//viewerinfo.window.once("ready-to-show",()=>{ if(scope.focus == "default") {viewerinfo.window.show()}})
				viewerinfo.window.webContents.on('did-finish-load',finishload);
				viewerinfo.window.hide();
				// setup the window close handler
				viewerinfo.window.on("closed", ()=>
				//	function ()
					{
						// console.log("window removed from list url="+this.c.viewerinfo.url);
						remove(service.viewerList, viewerinfo);
					}// .bind({c: new worker(oldwindow,viewerinfo)})
				);
				viewerinfo.window.webContents.on('crashed', (e) => {
					console.log("window crashed error ="+ JSON.stringify(e));
				});
				// load the new image into it

				viewerinfo.url=image_url;
				// save the position info in the viewer
				viewerinfo.config.x = new_x;
				viewerinfo.config.y = new_y;
				loading=viewerinfo;
				viewerinfo.loading=true;
				console.log("window loading url now="+image_url);
				viewerinfo.window.hide()
				viewerinfo.window.loadURL(image_url);
				viewerinfo.window.hide()
			} catch (e) {
				console.log("oops window closed on move=" + e)
				remove(service.viewerList, viewerinfo)
			}
		}

		service.cancel = function (Viewer) {
			console.log("in close for Viewer.Name")
			var list = service.viewerList.slice()
			for (let v of list) {
				console.log("window " + v.Viewer.Name)
				if (Viewer == null ||
						(Viewer != null &&
							(
								(typeof v.Viewer != "undefined")
								&& v.Viewer.Name == Viewer.Name))) {
					// if the viewer needs updating
					if (v.window != null) {
						console.log("closing window=" + v.Viewer.Name)
						v.window.hide();
						v.window.close();
					}
					console.log('force remove window=' + v.Viewer.Name);
					remove(service.viewerList, v)
					break;
				}
			}
		}
		// timer event handler
		// get the next image for each viewer
		async function updateImg() {
			// check if busy and set if false. (test and set operation)
			if ((busy == false) && ( busy = true )) {
				// copy list of viewers
				let viewers = service.viewerList.slice();
				if (scope.focus != "sleep") {
					// now
					let now = Date.now();
					// loop thru the list of viewers
					for (let viewer of viewers) {
						// if the viewer needs updating
						if ( (viewer.lastUpdate>0) && (now > (viewer.lastUpdate + (viewer.refreshIntervalSeconds * 1000))) && loading==null) {
							// need to update this window
							// get the next image
							// console.log("updateimg calling viewer next")
							try {
								let pic = await viewer.Viewer.next(viewer)
								viewer.lastUpdate=-1;
								console.log("viewer last update reset check");
								// and we have a picture, watch out for race
								if (pic != null) {
									console.log("have image="+pic +" for viewer="+viewer.Viewer.Name+" now loading")
									// console.log("have image to load="+pic);
									// load the next image in the new position
									moveWindow(pic, viewer);
									// set the last updated time, will get corrected when image actualy loads
									console.log("resetting last update  for viewer="+viewer.Viewer.Name)
									viewer.lastUpdate = Date.now();
								}
								else{
										console.log("viewer "+viewer.Viewer.Name+" last update reset");
										viewer.lastUpdate=1;
								}
							}
							catch(error)
							{
								console.log("unexpected error from next="+error);
								busy=false;
								throw error;
							}
						} // end if
					} // end for
          busy=false;
				} else {
				  busy = false;
				}
			}	else {
				// console.log("update img was busy already");
        busy=false;
			}
		}; // end function

		// handle all the windows with LoadURL completed
		function handleLoadComplete(){
			// get the active loaded window list
			let s = service.windowlist;
			// clear the current list
			service.windowlist=[];
			// loop thru the list, if any
			while(s.length>0) {
				// use the 1st entry in the array
				// note splice returns an array, even if only 1 element
				let c = s.splice(0,1)[0];
				if(c !=null)
					loaded(c);
			}		// end of while loop

			updateImg();
		}

		service.startViewer = function (Viewer, $scope) {
			//// console.log("starting a new viewer="+Viewer.Name);
			service.startup("/mnt/buildserver/media/Photos/test/images/**.*jpg", Viewer, $scope)
		}

		// start a viewer
		service.startup = function (location, delay, $scope) {
			scope = scope == null ? $scope : scope;

			// if we have a url
			if (location != null) {
				var refreshdelay = delay
				if (typeof delay == "object") {
					refreshdelay = delay.ImageRefreshRate
				}
				// get the list of images
				var viewerinfo = {
					url: location,
					window: null,
					images: {
						found: []
					},
					loading:false,
          loadingImages:false,
					index: -1,
					refreshIntervalSeconds: refreshdelay,
					lastUpdate: 1,
					resolvers:{}
				};
				// clone viewerinfo from the local object
				viewerinfo = JSON.parse(JSON.stringify(viewerinfo));

				if (typeof delay == "object") {
					// clone view from scheduler
					var next = delay.next;
					// functions are not cloned
					viewerinfo.Viewer = JSON.parse(JSON.stringify(delay));
					viewerinfo.Viewer.next=next;
				}

				// figure out where the window should be, and how big.
				if (SCREEN_W < 0) {

					SCREEN_W = scope.screen.width;
					SCREEN_H = scope.screen.height;
				}
				var dx = scope.config.Scheduler.ViewerWidth;
				var dy = scope.config.Scheduler.ViewerHeight;
				var x = (random(0, SCREEN_W - dx) % (SCREEN_W - dx * 2)) + dx;
				var y = (random(SCREEN_H - dy, SCREEN_H) % (SCREEN_H - dy * 2)) + dy;
				var wconfig = {
					width: dx,
					height: dy,
					x: x,
					y: y
				}
				viewerinfo.config = JSON.parse(JSON.stringify(wconfig));

				service.viewerList.push(viewerinfo);

			}
			// cycle minimum = 5 seconds
			// only do this once
			if (!timeractve) {
				registerRefreshInterval(handleLoadComplete, refresh_interval * 1000);
				timeractve = true
				
				scope.$watch(
					'focus', (newval,oldval)=>{
						console.log("scope focus change, old="+oldval+" new="+newval);
						// loop thru the list of viewers
						for (let viewer of service.viewerList.slice()) {
							if (viewer.window != null){
								if(newval == 'default'){
									viewer.window.show();
								} else if(oldval=='default'){
									viewer.window.hide();
								}
							}
						}
					}
				)
			}
		};
		function remove(arr, item) {
			for (var i = 0; i < arr.length; i++) {
				if (arr[i] === item) {
					// console.log("item removed");
					arr[i].window = null;
					arr.splice(i, 1);
				}
			}
		}

		var registerRefreshInterval = function (callback, interval) {
			if (typeof interval !== "undefined") {
				$interval(callback, interval);
			}
		}
		function random(min, max) {
			return Math.floor(Math.random() * (max - min + 1)) + min;
		}
		function rand() {
			return random(0, 32767);
		}
		console.log("returning ImageService object");
		return service;
	}
	function format(x){
		return x;
	}
	function toMb(x){
		return x
	}
	function getMemory() {
		// `format` omitted  (pads + limits to 15 characters for the output)
		function logMemDetails(x) {
			function toMb(bytes) {
				return (bytes / (1000.0 * 1000)).toFixed(2)
			}

			console.log(
				format(x[0]),
				format(x[1].count),
				format(toMb(x[1].size) + "MB"),
				format(toMb(x[1].liveSize) +"MB")
			)
		}

		console.log(
			format("object"),
			format("count"),
			format("size"),
			format("liveSize")
		)
		Object.entries(webFrame.getResourceUsage()).map(logMemDetails)
		console.log('------')
	}

  //setInterval(getMemory, 5000)

	setInterval( ()=>{webFrame.clearCache()}, 15000)

	console.log("registering ImageService");
	angular.module("SmartMirror")
		.factory("ImageService", ImageService);

}
());
