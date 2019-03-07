function ImageHandler($scope, $http, $interval, ImageSchedulerService) {

	var atomScreen = require("electron").screen

	var mainScreen =atomScreen.getPrimaryDisplay();
	var dimensions = mainScreen.size;

	console.log("window size w="+dimensions.width+" h="+dimensions.height);
	$scope.screen= {}
	$scope.screen.width=dimensions.width
	$scope.screen.height=dimensions.height
	ImageSchedulerService.startup($scope);
}

angular.module("SmartMirror")
	.controller("ImageScheduler", ImageHandler);
