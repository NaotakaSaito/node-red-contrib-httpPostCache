module.exports = function(RED) {
	const searchCache = require("./cache-search");
	const deleteCache = require("./cache-delete");
	const fs = require("fs");
	let sendingMsg = {};
	function HttpPostCacheDebug(config) {
		RED.nodes.createNode(this,config);
		let node = this;
		node.channel  = RED.nodes.getNode(config.channel);
		node.on('input', function(msg) {
			node.channel.debug();
		});
	}
	RED.nodes.registerType("http-post-cache-debug",HttpPostCacheDebug);


	function HttpPostChacheInput(config) {
		RED.nodes.createNode(this,config);
		let node = this;
		node.channel  = RED.nodes.getNode(config.channel);
		node.channel.register(node,output);
		node.on('input', function(msg) {
			node.channel.input(msg);
		});
		function output(msg) {
			sendingMsg[msg._msgid] = JSON.parse(JSON.stringify(msg));
			node.send(msg);
		}
	}
	RED.nodes.registerType("http-post-cache-input",HttpPostChacheInput);

	function HttpPostCacheJudge(config) {
		RED.nodes.createNode(this,config);
		let node = this;
		this.channel  = RED.nodes.getNode(config.channel);
		node.on('input', function(msg) {
			node.channel.judge(msg);
		});
	}
	RED.nodes.registerType("http-post-cache-judge",HttpPostCacheJudge);

	function HttpPostCacheChannel(config) {
		RED.nodes.createNode(this,config);
		let node = this;
		node.config = config;
		node.timer = null;
		node.cacheEnb = true;
		node.postSuccess = false;
		node.users = {};
		node.sending = {};
		if(isNaN(node.config.interval) === true)  {
			RED.log.warn(`http-post-cache-channel.interval is not number`);
			return;
		}
		if(isNaN(node.config.expiration) === true)  {
			RED.log.warn(`http-post-cache-channel.expiration is not number`);
			return;
		}
		node.config.interval = parseInt(node.config.interval);
		node.config.expiration = parseInt(node.config.expiration);
		node.config.path = node.config.path.replace(/\/$/,"");

		node.debug = function() {
			console.log(node);
		}
		node.input = function(msg) {
			if(node.cacheEnb===false){
				for(let id in node.users) {
					node.users[id].callback(msg);
				}
			} else {
				let params = {
					msg : msg
				}
				saveMsg(params);
			}
		}
		node.judge = function(msg) {
			let params = {
				msg : sendingMsg[msg._msgid]
			}
			delete sendingMsg[msg._msgid];
			if(msg.statusCode !== 200) {
				if((node.postSuccess === true) || (node.cacheEnb === false)) {
					node.postSuccess = false;
					node.cacheEnb = true;
					for(let key in node.users) {
						node.users[key].node.status({fill:"red",shape:"ring",text:"node-red:common.status.disconnected"});
					}
				}
				try {
					if(node.sending.msg._msgid === msg._msgid) {
						node.sending.msg = params.msg;
						node.timeout = node.timeout * 2;
						if(node.timeout >= 5 *60 * 1000){
							node.timeout = 5 * 60 * 1000;
						}
						node.timer = setTimeout(sendRetry,node.timeout);
						return;
					} else {
						saveMsg(params);
					}
				} catch(e) {
					saveMsg(params);
				}
			} else {
				// 現在送付中のファイルを消す
				// 次のファイルをinterval後に送る
				if(node.cacheEnb === true) {
					deleteCache(node.sending,(err,d) => {
						if(err) {
							console.log(err);
						} else {
							searchCache(node,(err,d) => {
								if(err) {
									console.log(err);
								} else {
									switch(d.status) {
										case 'none':
											node.postSuccess =true;
											node.cacheEnb = false;
											for(let id in node.users) {
												node.users[id].node.status({fill:"green",shape:"dot",text:"node-red:common.status.connected"});
											}
											node.sending = {};
											node.timer = null;
											break;
										case 'cache':
											node.postSuccess =true;
											node.cacheEnb = true;
											for(let id in node.users) {
												node.users[id].node.status({fill:"yellow",shape:"ring",text:"node-red:common.status.connecting"});
											}
											node.sending = d;
											node.timeout = node.config.interval;
											node.timer = setTimeout(sendRetry,node.timeout);
											break;
									}
								}
							});
						}
					});
				}
			}
		}
		node.register = function(n,callback) {
			if(n.id){
				node.users[n.id] = {
					node: n,
					callback: callback
				}
				if(node.cacheEnb === false) {
					node.users[n.id].node.status({fill:"green",shape:"dot",text:"node-red:common.status.connected"});
				} else if( node.postSuccess === true) {
					node.users[n.id].node.status({fill:"yellow",shape:"ring",text:"node-red:common.status.connecting"});
				} else {
					node.users[n.id].node.status({fill:"red",shape:"ring",text:"node-red:common.status.disconnected"});
				}
			}
		}
		node.deregister = function(n) {
			if(n.id) delete node.users[n.id];
		}
		node.on("close",(done) => {
			console.log('done');
			if(node.timer) clearTimeout(node.timer);
			node.timer = null;
			done();
		});
		new Promise((resolve,reject) => {
			// キャッシュの保存パスが使用できるか確認
			if (!fs.existsSync(node.config.path)) {
				fs.mkdir(node.config.path,(err) => {
					if(err) {
						console.log(err);
						reject(`can not make directory in ${node.config.path}`);
					} else {
						resolve();
					}
				});
			} else {
				resolve();
			}
		}).then(() => {
			// 未送信のcacheがあるか確認
			searchCache(node,(err,d) => {
				if(err) {
					console.log(err);
				} else {
					if(d.status === "none") {
						node.postSuccess =true;
						node.cacheEnb = false;
						for(let id in node.users) {
							node.users[id].node.status({fill:"green",shape:"dot",text:"node-red:common.status.connected"});
						}
					} else {
						node.sending = d;
						node.timeout = node.config.interval;
						node.timer = setTimeout(sendRetry,node.timeout);
					}
				}
			});
		}).catch((err) => {
			RED.log.warn(err);
		});
		function saveMsg(params) {
			params.timestamp = params.msg.payload.timestamp || (new Date()).getTime();
			let timestamp = new Date(params.timestamp);
			params.ymd = `${node.config.path}/${timestamp.getFullYear()}.${timestamp.getMonth()+1}.${timestamp.getDate()}`;
			params.hour = `${params.ymd}/${timestamp.getHours()}`;
			params.file = `${params.hour}/${timestamp.getTime()}.json`;
			isYmdExist(params)
				.then(isHourExist)
				.then(saveInFile);
		}
		function isYmdExist(params) {
			return new Promise((resolve,reject) => {
				fs.stat(params.ymd,function (err, stats) {
					if (err) {
						fs.mkdir(params.ymd,(err) => {
							if(err) {
								console.log(err);
								reject(`can not make directory in ${node.config.ymd}`);
							} else {
								resolve(params);
							}
						});
					} else {
						if (stats.isDirectory()) {
							resolve(params);
						} else {
							reject(`isYmdExist ${params.ymd} is not direcoty`)
						}
					}
				});
			});
		}
		function isHourExist(params) {
			return new Promise((resolve,reject) => {
				fs.stat(params.hour,function (err, stats) {
					if (err) {
						fs.mkdir(params.hour,(err) => {
							if(err) {
								console.log(err);
								reject(`can not make directory in ${node.config.ymd}`);
							} else {
								resolve(params);
							}
						});
					} else {
						if (stats.isDirectory()) {
							resolve(params);
						} else {
							reject(`isHourExist ${params.hour} is not directory`);
						}
					}
				});
			});
		}
		function saveInFile(params) {
			return new Promise((resolve,reject) => {
				fs.writeFile(params.file,JSON.stringify(params.msg,null,"  "),(err) => {
					if(err) {
						console.log(err);
					}
					if(node.timer === null) {
						node.sending = params;
						node.timeout = node.config.interval;
						node.timer = setTimeout(sendRetry,node.timeout);
					}
				});
			});
		}
		function sendRetry() {
			for(let id in node.users) {
				node.users[id].callback(node.sending.msg);
			}
		}
	}
	RED.nodes.registerType("http-post-cache-channel",HttpPostCacheChannel);
}

