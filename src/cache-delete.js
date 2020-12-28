module.exports = cacheDelete;
const fs = require("fs");
function cacheDelete(params,callback) {
	fs.unlink(params.file,(err) => {
		if(err) {
			console.log(err);
			callback(err);
		} else {
			callback(null);
		}
	})
}

