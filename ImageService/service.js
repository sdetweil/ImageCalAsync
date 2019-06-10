//const electron = require('electron');
const BrowserWindow = require("electron").remote.BrowserWindow;
//const log = require("electron-log");
var loading= false;
(function () {
	"use strict";

	function ImageService($http, $interval) {
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
						// log.warn("processing for other window at " +service.viewerList[i].config.x+","+service.viewerList[i].config.y);
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
							// log.warn("diffs x="+ diffs.xdiff +" y="+diffs.ydiff)
							// if there is (either coordiante diff >0 is overlap), attempt to adjust position to prevent overlap
							if (diffs.xdiff > 0 && diffs.ydiff > 0) {
								// log.warn("windows overlap");
								// if 1st or second time thru the loop
								if (o <= 1) {
									// log.warn("1st time calc");
									// adjust x first (left amount to eliminate overlap)
									if (diffs.xdiff < diffs.ydiff && SCREEN_W > SCREEN_H)
									{new_x = Math.max(new_x - diffs.xdiff, 0)}
									else
									// adjust y (up amount to eliminate overlap)
									{new_y = Math.max(new_y - diffs.ydiff, 0)}
								} else {
									// log.warn("NOT 1st time calc");
									if (o < 10) {
										// log.warn("trying for the "+o+"th time");
										// if we tried already twice and are stuck, in the corner at 1/2 window size (x and y)
										if (new_x < viewerinfo.config.width / 2 && new_y < viewerinfo.config.height / 2) {
											// then force a wild change, middle of the screen
											new_y = SCREEN_H / 2
											new_x = SCREEN_W / 2
											// log.warn("new adjustment");
										} else {
											// force one dimension to edge)
											// log.warn("forcing position");
											// already left
											if (new_x == 0){
												// move up
												new_y = 0
												// log.warn("force Y position = 0");
											}
											else {
												// already up, move left
												new_x = 0
												// log.warn("force X position = 0");
											}
										}
									} else {
										// log.warn("break out of loop, can't resolve");
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
								// log.warn("have new position, recheck");
							} else {
								changed = false;
								// log.warn("diffs 0, no overlap ");
								// diffs both 0, so no overlap
								break;
							}
						}
					}
				}
			} while (changed == true)

			return info
		}

		function worker(window, viewer)
		{
			this.oldwindow=window;
			this.viewerinfo=viewer;
		}
		function loaded(c)
		{
			// log.warn("have window to process after load");

			// resize the new window
			try {
				// log.warn("window resize url="+c.viewerinfo.url);
				c.viewerinfo.window.webContents.executeJavaScript("if (document.images[0]) window.resizeTo(Math.min(document.images[0].width,window.innerWidth), Math.min(document.images[0].height,window.innerHeight));");
				// force repaint after resize
				c.viewerinfo.window.webContents.invalidate();
			} catch (ex) {
				// log.warn("window resize failed="+ex);
			}


			// log.warn("old window elapsed="+((Date.now()-c.viewerinfo.show)/1000)+" cycle time="+c.viewerinfo.refreshIntervalSeconds);
			// log.warn("showing window now");

			// make the window visible
			c.viewerinfo.show = Date.now();
			c.viewerinfo.window.show()
			c.viewerinfo.loading=false;
			loading=false;
			c.viewerinfo.lastUpdate = Date.now()
			// if old window exists
			if (c.oldwindow != null) {
				// log.warn("hiding old window");
				c.oldwindow.webContents.invalidate();
				c.oldwindow.hide();
			}
			else {
				// log.warn("old window is null");
			}

			// if old window exists
			if (c.oldwindow != null) {
				// remove any close listeners
				c.oldwindow.removeAllListeners("closed");
				// close it
				try {
					// log.warn("closing old window");
					c.oldwindow.close();
				} catch (e) {
					// log.warn("window close failed="+ex);
				}
			}
		}
		function moveWindow(image_url, viewerinfo) {

			try {
				var window = viewerinfo.window;
				//  get the current window size
				var winsize = window.getSize();
				// and position
				//var winpos  = window.getPosition();

				// calculate new window position
				var new_x = (rand() % (SCREEN_W - winsize[0] * 2)) + winsize[0];
				var new_y = (rand() % (SCREEN_H - winsize[1] * 2)) + winsize[1];
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
				// log.warn("getting window position");
				// if there other windows we might overlap
				if (service.viewerList.length > 1) {
					// check and adjust the proposed new position to avoid overlap
					var info = checkWindowOverlap(viewerinfo, new_x, new_y);
					new_x = info.x;
					new_y = info.y;
				}
				// log.warn("have window position");
				var wconfig = {
					width: viewerinfo.config.width,
					height: viewerinfo.config.height,
					x: new_x,
					y: new_y
				}
				// save the config
				viewerinfo.config = wconfig
				// get the current window object
				var oldwindow = viewerinfo.window

				// create the window, in new position, hidden
				viewerinfo.window = new BrowserWindow({
					width: viewerinfo.config.width,
					height: viewerinfo.config.height,
					x: new_x,
					y: new_y,
					alwaysOnTop: true,
					show:false,
					//transparent: true,
					backgroundColor: "#000000",
					dx: 0,
					dy: 0,
					frame: false,
					skipTaskbar: true
				})
				// log.warn("window created");
				// setup handler for when window is ready to show
				viewerinfo.window.once("ready-to-show",
				//viewerinfo.window.webContents.on('did-finish-load',
					function ()
					{
						//console.log("window load completed, window="+this.c.oldwindow+" viewer="+this.c.viewerinfo+" url="+this.c.viewerinfo.url);
						//loaded(this.c);
						service.windowlist.push(this.c);
						// log.warn("window load completed");
					}.bind({c: new worker(oldwindow,viewerinfo)})
				);

				// setup the window close handler
				viewerinfo.window.on("closed",
					function ()
					{
						// log.warn("window removed from list url="+this.c.viewerinfo.url);
						remove(service.viewerList, this.c.viewerinfo);
					}.bind({c: new worker(oldwindow,viewerinfo)})
				);
				// load the new image into it

				viewerinfo.url=image_url;
				// save the position info in the viewer
				viewerinfo.config.x = new_x;
				viewerinfo.config.y = new_y;
				loading=true;
				viewerinfo.loading=true;
				//console.log("window loading url now="+image_url);
				viewerinfo.window.loadURL(image_url);
			} catch (e) {
				log.warn("oops window closed on move=" + e)
				remove(service.viewerList, viewerinfo)
			}
		}

		service.cancel = function (Viewer) {
			// log.warn("in close")
			var list = service.viewerList
			for (var i = 0; i < list.length; i++) {
				// log.warn("window " + i)
				if (Viewer == null ||
						(Viewer != null &&
							(
								(typeof list[i].Viewer != "undefined")
								&& list[i].Viewer.Name == Viewer.Name))) {
					// if the viewer needs updating
					if (list[i].window != null) {
						// log.warn("closing window=" + i)
						list[i].window.hide();
						list[i].window.close();
					} else {
						// log.warn('force remove window=' + i);
						remove(service.viewerList, list[i])
					}
				}
			}
		}
		// timer event handler
		// get the next image for each viewer
		function updateImg() {
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
						if ( (viewer.lastUpdate>0) && (now > (viewer.lastUpdate + (viewer.refreshIntervalSeconds * 1000))) && loading==false) {
							// need to update this window
							// get the next image
							// log.warn("updateimg calling viewer next")

							viewer.lastUpdate=-1;
							viewer.Viewer.next(viewer).then( (x) => {
								console.log("viewer last update reset check");
								// if viewer waiting for content
								if(x.viewer.lastUpdate==-1){
									console.log("viewer "+x.viewer.Viewer.Name+" last update reset");
									x.viewer.lastUpdate=1;
								}
                console.log("have image="+x.pic +" for viewer="+x.viewer.Viewer.Name)
                // and we have a picture, watch out for race
                if (x.pic != null) {
                  console.log("have image="+x.pic +" for viewer="+x.viewer.Viewer.Name+" now loading")
                  // log.warn("have image to load="+pic);
                  // load the next image in the new position
                  moveWindow(x.pic, x.viewer);
                  // set the last updated time, will get corrected when image actualy loads
                  console.log("resetting last update  for viewer="+x.viewer.Viewer.Name)
                  x.viewer.lastUpdate = Date.now();
                } 
							});              
						} // end if
					} // end for
          busy=false;
				} else {
					// loop thru the list of viewers
					for (let viewer of viewers) {
						if (viewer.window != null){
							viewer.window.hide();
						}
					}
				  busy = false;          
				}
			}	else {
				// log.warn("update img was busy already");
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
				loaded(c);
			}		// end of while loop
			updateImg();
		}



		service.startViewer = function (Viewer, $scope) {
			//// log.warn("starting a new viewer="+Viewer.Name);
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
					lastUpdate: 1
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
				// create the window
				viewerinfo.window = new BrowserWindow({
					width: dx,
					height: dy,
					x: x,
					y: y,
					alwaysOnTop: true,
					show: false,
					transparent: true,
					dx: 0,
					dy: 0,
					frame: false,
					skipTaskbar: true
				})
				service.viewerList.push(viewerinfo);

			}
			// cycle minimum = 5 seconds
			// only do this once
			if (!timeractve) {
				registerRefreshInterval(handleLoadComplete, refresh_interval * 1000);
				timeractve = true
			}
		};
		function remove(arr, item) {
			for (var i = 0; i < arr.length; i++) {
				if (arr[i] === item) {
					// log.warn("item removed");
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
	console.log("registering ImageService");
	angular.module("SmartMirror")
		.factory("ImageService", ImageService);

}
());
