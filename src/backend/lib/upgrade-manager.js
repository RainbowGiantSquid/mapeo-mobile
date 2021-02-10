const UpgradeStorage = require("../lib/upgrade-storage");
const UpgradeServer = require("../lib/upgrade-server");
const UpgradeDownload = require("../lib/upgrade-download");
const clone = require("clone");

class UpgradeManager {
  constructor(dir, port, currentVersion, emitFn, listenFn, removeFn) {
    this.storage = new UpgradeStorage(dir);
    this.server = new UpgradeServer(this.storage, port);
    this.downloader = new UpgradeDownload(this.storage, {
      version: currentVersion,
    });
    this.emit = emitFn;
    this.addListener = listenFn;
    this.removeListener = removeFn;

    // Event interface
    this.addListener("p2p-upgrade::get-state", () => {
      this.emitState();
    });
    this.addListener("p2p-upgrade::start-services", () => {
      this.server.share();
      this.downloader.start();
    });
    this.addListener("p2p-upgrade::stop-services", () => {
      this.server.drain();
      this.downloader.stop();
    });

    // State aggregation
    this.state = {
      server: this.server.state,
      downloader: this.downloader.state,
    };
    this.server.on("state", (state, context) => {
      this.state.server = { state, context };
      this.emitState();
    });
    this.downloader.on("state", state => {
      this.state.downloader = state;
      this.emitState();
    });
  }

  emitState() {
    this.emit("p2p-upgrade::state", clone(this.state));
  }

  setApkInfo(apkPath, version, cb) {
    this.storage.setApkInfo(apkPath, version, cb);
  }
}

module.exports = UpgradeManager;
