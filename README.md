# sync-here
[For the first study sample] Simple one-way sync local to remote always with use watcher(paulmillr/chokidar) and sftp(mscdex/ssh2).

## Example(test/)
```js
const SyncHere = require('../index.js');

const sync = new SyncHere({
    /* --- conform (mscdex/ssh2) method ---
    host: "",
    port: 22,
    username: "",
    password: ""
    privateKey: require("fs").readFileSync("/path/to/.ssh/key"),
    passphrase: ""
    */
}, '/path/to/remote/directory');

// before sync
sync.before((event, target) => {
    return new Promise((resolve) => {
        console.log(`target: ${target}, event: ${event}`);
        resolve();
    });
});

// after sync
sync.after((event, target) => {
    return new Promise((resolve) => {
        console.log(`target: ${target}, event: ${event}`);
        resolve();
    });
});

sync.error((message) => {
    console.log('-----error occored-----');
    console.log(message);
});
````
