const path=require('path');
var Prefix="gdrive://";
var driver=null;
var waiting=false;
var common= require(__dirname+"/common.js");
var url_prefix="https://drive.google.com/uc?id="
var url_suffix="";
var redirectUrl="https://developers.google.com/oauthplayground";



var {google} = require("googleapis");
//const {gal} = require("google-auth-library");
const Auth =google.auth;
var https = require("https");
//const refresh_url = "www.googleapis.com/oauth2/v4/token";
var querystring = require("querystring");
const SCOPES = "https://www.googleapis.com/auth/drive";


/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
 async function getNewToken(oauth2Clientx) {
  return new Promise((resolve,reject) =>{
	var authUrl = oauth2Clientx.generateAuthUrl({
		access_type: "offline",
		scope: SCOPES
	});
	//let body = "{}";

	console.log("authc="+querystring.stringify(oauth2Clientx)+"\n===url="+authUrl);

	const post_body = querystring.stringify({
		"grant_type":"refresh_token",
		"client_id":oauth2Clientx._clientId,
		"client_secret":oauth2Clientx._clientSecret,
		"refresh_token":oauth2Clientx.refresh_token,
		"redirect_uri": oauth2Clientx._redirectUri,
		"access_type": "offline",
		"scope": SCOPES
	});
	console.log("done="+post_body);
	let refresh_request = {
		hostname : "www.googleapis.com",
		path:"/oauth2/v4/token",
		body: post_body,
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			"Content-Length": Buffer.byteLength(post_body)
		}
	};
	let access_code="";
	// Set up the request
	var post_req = https.request(refresh_request, function(res) {
		res.setEncoding("utf8");
		res.on("data", function (chunk) {
			console.log("Response: " + chunk);
			access_code+=chunk;
		});
		res.on("error",function(){
			//console.log("error="+err);
		});
		res.on("end",function(err){
			if(err==null)
			{
				var error = null;
				if(access_code.length>0){
					var ac=JSON.parse(access_code)
					if(ac.access_token!=null)
					{
						var token=oauth2Clientx.access_token=oauth2Clientx.credentials.access_token = JSON.parse(access_code).access_token;
						console.log("access token info="+token);
					}
					else{
						console.log("refresh error");
						error="refresh failed";
					}
					console.log("calling with updated access token");
					resolve(oauth2Clientx);
				}
			}
			else{
				console.log("get token end, error="+err);
				reject(err)
			}
		});
	
	// post the data
	post_req.write(post_body);
	post_req.end();
	})
	});
}

/**
 *
 * raw google drive access method.
 */

async function listFiles(auth,parents,type,nextPageToken,Files) {
	console.log("auth="+JSON.stringify(auth));
  //return new Promise((resolve,reject) =>{ 
    var extra="";
    switch(type){
    case 0:  // files
      extra="mimeType contains 'image/'";
      break;
    case 1:  // folders
      extra="mimeType = 'application/vnd.google-apps.folder'";
      break;
    case 2:  // both
      extra="(mimeType contains 'image/' or mimeType = 'application/vnd.google-apps.folder' ) ";
      break;
    case 3:  // resolving names
      extra="("+parents +") and (mimeType = 'application/vnd.google-apps.folder' ) ";
      break;
    }
    var q="";

    if(type !==3 && parents!=null){
      q+="parents in '"+parents+"' and ";
    }
    q+= extra;
    //q="((name = '2009') or (name='Google Photos')) and (mimeType = 'application/vnd.google-apps.folder' )";
    console.log("query="+q);
    var px = {auth:auth,pageToken:nextPageToken, pagesize:100,fields:"nextPageToken, files(id, name,parents,mimeType)",q:q};   
    try { 
    	let response= await drive.files.list(px) //, (err, response) => {
        nextPageToken=response.nextPageToken;
        console.log("there were "+response.files.length+" file entries returned");
        if (response.files.length> 0)
        {
          Files=Files.concat(response.files);
          if(nextPageToken!=null)
          {
            try {
               return await listFiles(auth,parents,type,nextPageToken,Files)//
            }
            catch(err){
               throw(err)
            }
          }
          else
          {
            console.log("no more files, return to caller="+auth.access_token);
            return({files:x.Files,token:null})
          }
        }
        else
        {
          console.log("no files, return to caller="+auth.access_token);
          return({files:x.Files,token:x.nextPageToken})
        }
    }
    catch(err) {
        console.log("The API returned an error: " + err);
        console.log("error="+JSON.stringify(err));
        if(err.errors[0].message.includes("Invalid Credentials")){
          auth.refresh_token="1/4WQ7AHQPnEDP2pgdZXePKf9YhdQHVg9hl5f9_CtlfXk";
 	  try {
              let newauth= await getNewToken(auth)
              	//console.log("this="+JSON.stringify(this));
              return await listFiles(newauth,parents,type,nextPageToken,files) //.then((err,file, newtoken)=>{
          }
          catch(err) {
              throw(err)
          }
     	}
        else 
           throw(err)
    }

}


function worker(parm)
{
	this.viewerinfo=parm;
}
let oauth2Client={};

// used to list the files to display NOW
module.exports.listImageFiles = async function (ImageItem, viewerinfo) {
	console.log("in handler for google drive");
 // return new Promise((resolve,reject) =>{
    // if the file path has a wildcard, OR does NOT contain a . (just folders)
    if (ImageItem.Image.PathFromSource.indexOf("*") >= 0 || !ImageItem.Image.PathFromSource.includes("."))
    {
      // construct the  full path to files
      var dpath = ImageItem.Source.Root + (ImageItem.Image.PathFromSource.startsWith("/")?"":"/") + ImageItem.Image.PathFromSource;
      // get the extension of the files (jpg, gif, ...)
      var ext = dpath.substring(dpath.lastIndexOf("/"));
      // get the just the target folder for dropbox or google drive
      dpath = dpath.substring(0, dpath.lastIndexOf("/"));
      if (drive == null)
      {
        try {
        	drive =  google.drive("v3");
        } 
        catch (error)
        {
          console.log("drive api setup error="+error)
          throw(error);
        }
      }
      console.log("auth info="+JSON.stringify(ImageItem.Source.Authinfo));
      oauth2Client = new Auth.OAuth2(ImageItem.Source.Authinfo.Userid, ImageItem.Source.Authinfo.Password, redirectUrl);
      oauth2Client.access_token=oauth2Client.credentials.access_token=ImageItem.Source.Authinfo.OAuthid;
      //console.log("oauth client="+JSON.stringify(oauth2Client));
      oauth2Client.refresh_token="1/vVytCOrje0r9cweBWdWW0zQFMN2aTbDAzMhX4hCQcBSi6WVjVj-yMbUO-h0dlmmk";

      let filelist=[];
      // do we want JUST folder?
      var justFiles=3;
      while(dpath.startsWith("//")){
		dpath=dpath.substring(1);
      }
      var parts=dpath.split("/");
      var folder_names="";
      var path_entries=[];
      for(let pathpart of parts){
        if(pathpart!="" && !pathpart.includes("*")){
          folder_names+=" or ( name = '"+pathpart+"')";
          console.log("path_entries adding="+pathpart);
          path_entries.push({name:pathpart,id:"",parent:""});
        }
      }
      if(path_entries.length==0){
		folder_names="parents='root'";
      }
      else{
	folder_names=folder_names.substring(4);
      }
      // get the list of files that matter
      try {
            let x= await listFiles(oauth2Client,folder_names,3,null,filelist)//.then( 
            console.log("back from get path name ids, count="+x.files.length);
            // assume the root
            var parents="root";
            if(path_entries.length>0)
            {
              // have the list of mapped folders to ids and parents
              var pp= updatePathWithIDs(path_entries,x.files);
              parents=pp[pp.length-1].name;
              if(parents=="")
              {parents="root";}
            }
            console.log("out dpath="+parents);
            filelist=[];
            var justFiles=2;  // just files
            try {
               // get the list of files that matter
              let x= await listFiles(oauth2Client,parents,justFiles,null,filelist)//.then(
                  console.log("have "+x.files.length+" files available");
                  for (let file of x.files)
                  {
                    console.log("processing file="+file.name+" id="+file.id+" file info="+JSON.stringify(file));
                    if (!file["mimeType"].includes("folder"))
                    {
                      if (ext === "/*" || file.name.toLowerCase().endsWith(ext.toLowerCase().substring(ext.lastIndexOf("*")+1)))
                      {
                        console.log("file="+Prefix + file.id);
                        viewerinfo.images.found.push(Prefix + file.id)
                      }
                      // console.log("Drive " + file)
                    }
                  }
                  // if the access token has changed
                  console.log("end of file list new_token="+newtoken+" old token="+ImageItem.Source.Authinfo.OAuthid);
                  if(newtoken!==ImageItem.Source.Authinfo.OAuthid)
                  {
                    // save it in the running item for next cycle
		    		ImageItem.Source.Authinfo.OAuthid=newtoken
                    // set it for current runtime
                    oauth2Client.access_token=oauth2Client.credentials.access_token=ImageItem.Source.Authinfo.OAuthid;
                    console.log("updating database for datasource id="+ImageItem.Source._id);
                    // and update the database with the new key for next time around
                    try {
                    	let result = await common.getdb().collection("DataSources").update({_id: ImageItem.Source._id },ImageItem.Source)
                        console.log("google drive datasource doc updated")
                    }
                    catch(err){
                        console.log("database updated failed err="+err);
                        throw( err);
                    }
                  }
                  // let the viewer know we have files
                  console.log("Drive  sending files back count=" + viewerinfo.images.found.length);
                  return(viewerinfo);
                }
		catch(err){
                  console.log("error getting file list="+err);
                  throw(err);
                }
          }
          catch(err){
            console.log("error getting folder ids="+err);
            throw(err)
          }
    }
    else
    {
      console.log("only one file entry="+Prefix + ImageItem.Source.Root + ImageItem.Image.PathFromSource);
      // no wildcard, so just one file entry
      // construct the url from the source and image entries
      //var url = ImageItem.Source.Root + ImageItem.Image.PathFromSource
      // just one file, add it to the list
      viewerinfo.images.found.push(Prefix + ImageItem.Source.Root + ImageItem.Image.PathFromSource);
      return(viewerinfo)
    }
//  })
}
module.exports.resolver = async function (file) {
    console.log("file resolver returning "+url_prefix+file.substring(Prefix.length)+url_suffix+" for "+file);
    var id=file.substring(Prefix.length)
    try {
      // get the file permissions
      let permissionData= await drive.permissions.list({auth:outh2Client,fileId:id})
        // assume we will have to update the permissions
        var update=true;
        // loop thru existing permissions
        for(var p of permissionData.permissions){
          // if anyone can read, all ok
          if(p.type=="anyone" && p.role=="reader"){
            // no need to update
            break;
          }
        }
        if(update){
          var p2={kind: "drive#permission",type:"anyone",role:"reader"}
          try {
              let newPermissions=await drive.permissions.create({fileId:this.id,auth:oauth2Client,resource:p2})
              console.log("new permissions="+JSON.stringify(newPermissions));
              return(url_prefix+id+url_suffix)
	  }
	  catch(err){
	      console.log("create permission error="+err)
	      throw("create permission error="+err)
	  }
        }
        else{
          console.log("google resolve returning "+url_prefix+this.id+url_suffix+" for file="+this.name)
          return(url_prefix+id+url_suffix)
        }
    }
    catch(err) {
        console.log("file permissions error="+err);
        throw("file permissions error="+err)
    }

}
module.exports.getPrefix = function () {
	return Prefix;
}
let oauth2Client1={};
module.exports.listFiles = async function(Authinfo,dpath, FoldersOnly){
	if (drive == null){
		drive =  google.drive("v3");
	}

	console.log("auth info="+JSON.stringify(Authinfo));
	oauth2Client1 = new Auth.OAuth2(Authinfo.Userid, Authinfo.Password, redirectUrl);
	oauth2Client1.access_token=oauth2Client1.credentials.access_token=Authinfo.OAuthid;
	//console.log("oauth client="+JSON.stringify(oauth2Client1));
	oauth2Client1.refresh_token="1/4WQ7AHQPnEDP2pgdZXePKf9YhdQHVg9hl5f9_CtlfXk";

	let filelist=[];
	// do we want JUST folder?
	var justFiles=3;
	while(dpath.startsWith("//"))
	{dpath=dpath.substring(1);}
	var parts=dpath.split("/");
	var folder_names="";
	var path_entries=[];
	for(let pathpart of parts)
	{
		if(pathpart!="" && !pathpart.includes("*"))
		{
			folder_names+=" or ( name = '"+pathpart+"')";
			console.log("path_entries adding="+pathpart);
			path_entries.push({name:pathpart,id:"",parent:""});
		}
	}
	if(path_entries.length==0)
	{folder_names="parents='root'";}
	else
	{folder_names=folder_names.substring(4);}
        try {
		// get the list of files that matter
		let x=await listFiles(oauth2Client1,folder_names,3,null,filelist)
		console.log("back from get path name ids, count="+files.length);
		// assume the root
		var parents="root";
		if(path_entries.length>0)
		{
			// have the list of mapped folders to ids and parents
			var pp= updatePathWithIDs(path_entries,x.files);
			parents=pp[pp.length-1].name;
			if(parents=="")
			{parents="root";}
		}
		console.log("out dpath="+parents);
		filelist=[];
		// do we want JUST folder?
		justFiles=(FoldersOnly=="true"?1:2);
		try { 
		   // get the list of files that matter
		   let x= await listFiles(oauth2Client1,parents,justFiles,null,filelist)
        	   console.log("have "+x.files.length+" files available");
		   let Files=[]
		   for (let file of x.files) {
			console.log("processing file="+file.name+" id="+file.id+" file info="+JSON.stringify(file));
			// if we are requesting files and folders
			if(FoldersOnly=="true" && !file["mimeType"].includes("folder") )
			{continue;}
			var entry = {};
			entry.filetype=(file["mimeType"].includes("folder"))?"Folder":"File";
			entry.name=file.name;
			entry.id=file.id;
			Files.push(entry);
	 	   }
		   return ({ files:Files,token:newtoken});
		}
		catch(err){
		   throw(err);
		}
	}
	catch(err){
	  throw(err);
	}
}
var updatePathWithIDs = function(path_array,name_array)
{

	console.log("in update parts");
	var Matched=path_array.length;
	// loop thru the split path backwards
	for(var i=path_array.length-1; i>=0; i--)
	{
		// loop thru the found folder names
		for(var n=0;n<name_array.length;n++)
		{
			console.log("checking "+path_array[i].name +" = "+name_array[n].name);
      		// if the names match
			if(path_array[i].name==name_array[n].name)
			{
				console.log("have name match");
				if(i<path_array.length-1)
				{
					console.log(" not last path part entry");
          			// if the current found NAMEd elements ID does NOT
					// match the childs (+1) PARENT

					console.log(i+"=i comparing "+path_array[i+1].parent+" with "+name_array[n].id);
					if(name_array[n].id!=path_array[i+1].parent)
					{
						console.log("parent ID does not match");
						// then not a NAME match, keep looking
						continue;
 					  }
					else
					{
						console.log("parent ID does match");
						// replace the name with the id
						path_array[i].name=name_array[n].id;
						// set the actual parent to the named folder parent
						path_array[i].parent=name_array[n].parent;
						// done
						//
						Matched--;
						break;
					}
				}
				else
				{
					console.log(" leaf most node i="+i);
					path_array[i].name=name_array[n].id;
					path_array[i].parent=name_array[n].parents[0];
					console.log("new parent="+name_array[n].parents[0]);
					Matched--;
					break;
				}
			}
		}
	}
	return path_array;

}

