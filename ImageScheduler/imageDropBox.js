var Dropbox = require("dropbox");
var Prefix= "dropbox://";
var dbx=null;
var waiting=false;
function worker(parm)
{
	this.viewerinfo=parm;
}

module.exports.listImageFiles = async function (ImageItem, viewerinfo) {
	//return new Promise((resolve,reject) =>{
		if (ImageItem.Image.PathFromSource.indexOf("*") >= 0) {
      // construct the  full path to files
			var dpath = ImageItem.Source.Root + (ImageItem.Image.PathFromSource.startsWith("/")?"":"/")+ ImageItem.Image.PathFromSource;
      // get the extension of the files (jpg, gif, ...)
			var ext = dpath.substring(dpath.lastIndexOf("/"));
      // get the just the target folder for dropbox
			dpath = dpath.substring(0, dpath.lastIndexOf("/"));
      if(dpath==='/')
        dpath="";
			if (dbx == null){
        try {
				dbx = new Dropbox.Dropbox({
					accessToken: ImageItem.Source.Authinfo.OAuthid
				});
        }
        catch(error){
				 console.log("dropbox connection error ="+error)
         throw( "dropbox connection error ="+error)
        }
			}
			try {
				let list = await dbx.filesListFolder({
					path: dpath
				})
          for (let file of list.entries) {
            if (file[".tag"] === "file") {
              var filename = file.name;
              if (filename.toLowerCase().endsWith(ext.toLowerCase().substring(ext.lastIndexOf("*")+1)) || 
							  filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.png') || filename.toLowerCase().endsWith('.gif'))
							{
                viewerinfo.images.found.push(Prefix + dpath + (filename.startsWith("/")?"/":"/")+ filename)
              }
            }
          }
          //console.log("dropbox returning list="+response.entries.length);
          // let the viewer know we have files
          return;
			}
			catch (error){
             
               console.log("Dropbox catch " + error);
          };
		} else {
      // construct the url from the source and image entries
      // just one file, add it to the list
			viewerinfo.images.found.push(Prefix + ImageItem.Source.Root + ImageItem.Image.PathFromSource);
			return;
		}
	//})
}
module.exports.resolver = async function (file) {
    // need to load the file
    // the fire back
		var args = {}
		args.path =file.substring(Prefix.length)
		args.path.startsWith("//")
		   args.path=args.path.substring(1);
    //  args.settings={}
    // %Y-%m-%dT%H:%M:%SZ
		if (waiting == false) {
			waiting = true;
      // args.settings.expires=dateFormat((new Date().getTime() + 60*60000),"isoUtcDateTime");
			try {
				let response=await dbx.sharingCreateSharedLinkWithSettings(args)
				waiting = false;
				return(response.url + "&raw=1")
				}
        catch (error ) {
            if (
              (error.error.error_summary.startsWith("shared_link_already_exists")) ||
                (error.error.error_summary.startsWith("settings_error/not_authorized"))) {
								try {
									let response=await dbx.sharingListSharedLinks(args)
									waiting = false;
									//console.log("reshare url=" + response.links[0].url)
									return(response.links[0].url + "&raw=1")
								}
							  catch(error){
									waiting = false;
									console.log("reshare failed url=" + file)
									throw("failed reshare file="+file);
								}                
            } else {
              console.log("Dropbox download " + error);
              waiting = false;
							throw("Dropbox created shared link failed, file="+file +" error=" + error)
            }
        };
		}
	//})
}
module.exports.getPrefix = function () {
	return Prefix;
}

module.exports.listFiles = function(Authinfo,path,FoldersOnly, callback){

	if(dbx==null)
	{
		dbx= new Dropbox({ accessToken: Authinfo.OAuthid });
		console.log("have a dropbox handle")
	}
	if(path ==="/*")
	{path="";}
	if(path.includes("/.."))
	{
		var i = path.lastIndexOf("/..")
		i = path.lastIndexOf("/",i-1)
		path=path.substring(0,i)
	}
	else
	{
		path=path.substring(0,path.lastIndexOf("/"))
	}
	dbx.filesListFolder({path: path})
		.then(
			function(response)
			{
				console.log(response);
				let files=[]
				for(let file of response.entries)
				{
					// if we are requesting files and folders
					if(FoldersOnly=="true" && file[".tag"]!="folder" )
					{continue}
					var entry = {}
					entry.filetype=file[".tag"].replace("f","F");
					entry.name=file.name
					files.push(entry)
					console.log(file)
				}
				console.log("dropbox returning list="+files.length);
				callback(null,files,null)
			}
		)
		.catch(
			function(error)
			{
				console.log("dropbox returning error="+error);
				callback(error,null)
			}
		);

}