
// remove a package.  if it has dependents, then fail, and demand that they be
// uninstalled first.  If activee, then fail, and depand that it be deactivated
// first.

module.exports = uninstall

uninstall.usage = "npm uninstall <name>[@<version> [<name>[@<version>] ...]"
                + "\nnpm rm <name>[@<version> [<name>[@<version>] ...]"

uninstall.completion = function (args, index, cb) {
  var installedPkgs = require("./utils/completion/installed-packages")
  installedPkgs(args, index, true, true, cb)
}

var rm = require("./utils/rm-rf")
  , fs = require("./utils/graceful-fs")
  , log = require("./utils/log")
  , readJson = require("./utils/read-json")
  , path = require("path")
  , npm = require("../npm")
  , chain = require("./utils/chain")
  , lifecycle = require("./utils/lifecycle")
  , semver = require("semver")
  , asyncMap = require("./utils/async-map")

function uninstall (args, cb) {
  // this is super easy
  // get the list of args that correspond to package names in either
  // the global npm.dir,
  // then call unbuild on all those folders to pull out their bins
  // and mans and whatnot, and then delete the folder.
  var  nm = npm.dir

  asyncMap(args, function (arg, cb) {
    var p = path.resolve(nm, arg)
    fs.lstat(p, function (er) {
      if (er) {
        log.warn(arg, "Not installed in "+nm)
        return cb(null, [])
      }
      cb(null, p)
    })
  }, function (er, folders) {
    asyncMap(folders, npm.commands.unbuild, cb)
  })
}
