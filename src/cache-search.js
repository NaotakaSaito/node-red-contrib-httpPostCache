module.exports = cacheSearch;
const fs = require("fs");
function cacheSearch(node,callback) {
	node.dd = 0;
	node.hh = 0;
	loopDay(node,(err,data) => {
		callback(err,data);
	})
}

function loopDay(node,callback) {
	let now = new Date();
	if(node.target) {
		if(node.target.getTime() < (new Date(now.getFullYear(),now.getMonth(),now.getDate() - node.config.expiration)).getTime()) {
			node.target = new Date(now.getFullYear(),now.getMonth(),now.getDate() - node.config.expiration);
			node.dd = 0;
			node.hh = 0;
		} else {
			node.target = new Date(now.getFullYear(),now.getMonth(),now.getDate() - node.config.expiration + node.dd);
		}
	} else {
		node.target = new Date(now.getFullYear(),now.getMonth(),now.getDate() - node.config.expiration);
	}
	node.targetDate = `${node.target.getFullYear()}.${node.target.getMonth()+1}.${node.target.getDate()}`;
	if(node.target.getTime() > now.getTime()) {
		node.dd = 0;
		node.hh = 0;
		callback(null,{status : 'none'});
		return;
	}
	fs.stat(`${node.config.path}/${node.targetDate}`,(err, stats) => {
		if(err) {
			node.dd = node.dd + 1;
			node.hh = node.hh + 0;
			loopDay(node,callback);
		} else {
			if(stats.isDirectory() === true) {
				loopHour(node,(err,data) => {
					if(err) {
						console.log(err);
					} else {
						switch(data.status) {
							case "cache":
								callback(null,data);
								break;
							case "end":
								fs.rmdir(`${node.config.path}/${node.targetDate}`,(err,data) => {
									node.dd += 1;
									node.hh = 0;
									loopDay(node,callback);
								});
								break;
							default:
								break;
						}
					}
				});
			} else {
				node.dd = node.dd + 1;
				node.hh = node.hh + 0;
				loopDay(node,callback);
			}
		}
	});
}

function loopHour(node,callback) {
	if(node.hh>23) {
		callback(null,{status: 'end'});
		return;
	}
	fs.stat(`${node.config.path}/${node.targetDate}/${node.hh}`,(err,data) => {
		if(err) {
			node.hh += 1;
			loopHour(node,callback);
		} else {
			fs.readdir(`${node.config.path}/${node.targetDate}/${node.hh}`,(err,files) => {
				if(err) {
					node.hh += 1;
					loopHour(node,callback);
				} else {
					// ファイルの読み込み
					if(files.length === 0) {
						fs.rmdir(`${node.config.path}/${node.targetDate}/${node.hh}`,(err,data) => {
							node.hh += 1;
							loopHour(node,callback);
						});
					} else {
						fs.readFile(`${node.config.path}/${node.targetDate}/${node.hh}/${files[0]}`,"utf-8",(err,data) => {
							try {
								let d = JSON.parse(data);
								node.file = files[0];
								callback(null,{
									status : 'cache',
									msg: d,
									ymd: `${node.config.path}/${node.targetDate}`,
									hour: `${node.config.path}/${node.targetDate}/${node.hh}`,
									file: `${node.config.path}/${node.targetDate}/${node.hh}/${files[0]}`,
								});
							} catch(e) {
								callback(e);
							}
						});
					}
				}
			});
		}
	});
}
