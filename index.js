function SyncHere(ssh_config, remote_workdir)
{
    this.ssh_config = ssh_config;
    this.remote_workdir = remote_workdir;

    this.watch_target = '.';
    this.watch_option = {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        cwd: '.'
    };

    this.exec_before = null;
    this.exec_after  = null;
    this.exec_error  = null;

    this.watcher = require('chokidar').watch(this.watch_target, this.watch_option);
    this.sftpCli = require('ssh2').Client;
    this.path    = require('path');

    this.start();
}

SyncHere.prototype.start = function()
{
    // watch start
    this.watcher.on('ready', () => {

        console.log('watcher start');

        this.watcher.on('add', (target, info) => {
            this.makeProc('add', target, info);
        });

        this.watcher.on('change', (target, info) => {
            this.makeProc('change', target, info);
        });

        this.watcher.on('addDir', (target, info) => {
            this.makeProc('addDir', target, info);
        });

        this.watcher.on('unlink', (target, info) => {
            this.removeProc('unlink', target, info);
        })

        this.watcher.on('unlinkDir', (target, info) => {
            this.removeProc('unlinkDir', target, info);
        });

    });
}

SyncHere.prototype.makeProc = async function(event, target, info)
{
    let dirs = target.split('/');
    if(['add', 'change'].indexOf(event) !== -1) { let file = dirs.splice(dirs.length-1, 1); }
    let dir  = '';
    let comb = '';

    try {
        await this.before(null, event, target);
        while((dir = dirs.shift()) != null) {
            comb = this.path.join(comb, dir);
            await this.doMake('mkdir', comb);
        }
        if(['add', 'change'].indexOf(event) !== -1) await this.doMake('put', target);
        await this.after(null, event, target);
    } catch(err) {
        this.error(null, err);
    }
}

SyncHere.prototype.removeProc = async function(event, target, info)
{

    try {
        await this.before(null, event, target);
        if(event === 'unlinkDir') {
            await this.doRemove('readdir', target);
            await this.doRemove('rmdir', target);
        }
        await this.after(null, event, target);
    } catch(err) {
        this.error(null, err);
    }
}

SyncHere.prototype.doMake = function(order, target)
{
    return new Promise((resolve, reject) => {
        const conn = new this.sftpCli();
        conn.on('ready', () => {
            conn.sftp((err, sftp) => {

                if(err) this.error(null, '[sftp]'+err);
                let remote_path = this.path.join(this.remote_workdir, target);

                switch(order) {
                    case 'mkdir':
                        sftp.exists(remote_path, (exists) => {
                            if(!exists) {
                                sftp.mkdir(remote_path, (err) => {
                                    if(err) this.error(null, `[${order}]`+err);
                                    conn.end();
                                    resolve();
                                });
                            } else {
                                conn.end();
                                resolve();
                            }
                        });
                        break;

                    case 'put':
                        sftp.fastPut(target, remote_path, (err) => {
                            if(err) this.error(null, `[${order}]`+err);
                            conn.end();
                            resolve();
                        });
                        break;
                }
            });
        }).connect(this.ssh_config);
    });
}

SyncHere.prototype.doRemove = function(order, target)
{
    return new Promise((resolve, reject) => {
        const conn = new this.sftpCli();
        conn.on('ready', () => {
            conn.sftp((err, sftp) => {

                if(err) this.error(null, '[sftp]'+err);
                let remote_path = this.path.join(this.remote_workdir, target);

                switch(order) {
                    case 'readdir':
                        sftp.exists(remote_path, (exists) => {
                            if(exists) {
                                sftp.readdir(remote_path, async (err, list) => {
                                    if(err) this.error(null, '[readdir]'+err+remote_path);

                                    if(list !== undefined && list.length > 0) {
                                        for(let i in list) {
                                            if(list[i]['longname'][0] === 'd') {
                                                await this.doRemove(
                                                    'readdir', this.path.join(target, list[i]['filename']));
                                            } else if(list[i]['longname'][0] === '-') {
                                                await this.doRemove(
                                                    'unlink', this.path.join(target, list[i]['filename']));
                                            }

                                            if(list[i] == list[list.length-1]) {
                                                conn.end();
                                                resolve();
                                            }
                                        }
                                    } else {
                                        conn.end();
                                        resolve();
                                    }
                                });
                            } else {
                                conn.end();
                                resolve();
                            }
                        });
                        break;

                    case 'rmdir':
                        sftp.exists(remote_path, async (exists) => {
                            if(exists) {
                                sftp.rmdir(remote_path, (err) => {
                                    if(err) this.error(null, `[${order}]`+err);
                                    conn.end();
                                    resolve();
                                });
                            } else {
                                conn.end();
                                resolve();
                            }
                        });
                        break;

                    case 'unlink':
                        sftp.exists(remote_path, (exists) => {
                            if(exists) {
                                sftp.unlink(remote_path, (err) => {
                                    if(err) this.error(null, `[${order}]`+err);
                                    conn.end();
                                    resolve();
                                });
                            } else {
                                conn.end();
                                resolve();
                            }
                        });
                        break;
                }
            });
        }).connect(this.ssh_config);
    });
}

SyncHere.prototype.before = function(cb=null, event, target) {
    return new Promise(async (resolve) => {
        if(typeof cb === 'function') {
            this.exec_before = cb;
        } else if(typeof this.exec_before !== 'undefined') {
            try {
                await this.exec_before(event, target);
                resolve();
            } catch(err) {
                this.error(null, '[before]'+err);
            }
        }
    });
}

SyncHere.prototype.after = async function(cb=null, event, target) {
    return new Promise(async (resolve) => {
        if(typeof cb === 'function') {
            this.exec_after = cb;
        } else if(typeof this.exec_after === 'function') {
            try{
                await this.exec_after(event, target);
                resolve();
            } catch(err) {
                this.error(null, '[after]'+err);
            }
        }
    });
}

SyncHere.prototype.error = function(cb=null, message) {

    if(typeof cb === 'function') {
        this.exec_error = cb;
    } else if(typeof this.exec_error !== 'undefined') {
        if(message.includes('Failure')) return;
        if(message.includes('No such file')) return;
        this.exec_error(message);
    }
}

module.exports = SyncHere;

