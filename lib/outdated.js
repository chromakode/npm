/*

npm outdated [pkg]

Does the following:

1. check for a new version of pkg

If no packages are specified, then run for all installed
packages.

*/

module.exports = outdated

outdated.usage = "npm outdated [<pkg> [<pkg> ...]]"

outdated.completion = function (args, index, cb) {
  var installedPkgs = require("./utils/completion/installed-packages")
  installedPkgs(args, index, false, true, cb)
}

var readInstalled = require("./utils/read-installed")
  , registry = require("./utils/registry")
  , path = require("path")
  , fs = require("./utils/graceful-fs")
  , readJson = require("./utils/read-json")
  , cache = require("./cache")
  , asyncMap = require("./utils/async-map")
  , npm = require("../npm")
  , log = require("./utils/log")

// outdated(pref)
// deps = pref/package.json dependencies, or {<pref/node_modules/*>:"*"}
// asyncMap over deps
//   if exists and (up to date
//       or (not in args and args is not empty))
//     return outdated(prefix/node_modules/d)
//   else if (in args or args is empty)
//     return [prefix, d]


// for each thing in prefix/node_modules/*
// if there's a newer one, report it
// otherwise, check its children
var output = require("./utils/output")
function outdated (args, silent, cb) {
  if (typeof cb !== "function") cb = silent, silent = false
  outdated_(npm.config.get("prefix"), args, function (er, list) {
    if (er) return cb(er)
    if (list.length && !silent) {
      var outList = list.map(function (ww) {
        return ww[1] + ": "+ww[0] + (ww[2] ? " (currently: "+ww[2]+")":"")
      })
      output.write(npm.config.get("outfd"), outList.join("\n"), function (e) {
        cb(e, list)
      })
    } else cb(null, list)
  })
}

function outdated_ (prefix, args, cb) {
  log(prefix, "outdated_ about to getDeps")
  getDeps(prefix, function (er, deps) {
    log([prefix, er, deps], "back from getDeps")
    if (er) return cb(er)
    // now deps is a "dependencies" object, {<name>:<req version>}
    asyncMap(Object.keys(deps), function (dep, cb) {
      var req = deps[dep]
      log([prefix, dep, req], "outdated_")
      validateDep(prefix, args, dep, req, function (er, exists, needsUpdate) {
        if (er) return cb(er)
        log([prefix, dep, req, exists, needsUpdate], "outdated_")
        if (needsUpdate) return cb(null, [[prefix, dep, exists]])
        else if (!exists) return cb(null, [])
        else outdated_(path.resolve(prefix, "node_modules", dep), args, cb)
      })
    }, cb)
  })
}

// return cb with (er, currentVersion or false, needsUpdate boolean)
function validateDep (prefix, args, dep, req, cb) {
  var canUpdate = args.length === 0 ? true : args.indexOf(dep !== -1)
    , current = -1
    , latest
    , needsUpdate = false

  readJson(path.resolve(prefix, "node_modules", dep,"package.json")
          ,function (er, data) {
    if (er) current = false
    else current = data.version
    log("back from readJson", "validateDep "+dep)
    next()
  })

  // only check for newer version if we can update this thing.
  if (canUpdate) {
    log([dep, req], "about to check")
    cache.add(dep, req, function (er, data) {
      if (er) {
        log(er)
        canUpdate = false
        return next()
      }
      latest = data.version
      log([dep, req, latest, current], "dep, req, latest, current")
      next()
    })
  } else next()

  var errState
  function next (er) {
    log([dep, req, current, latest, canUpdate, er], "validateDep next")
    if (errState) return log("error state")
    if (er) return cb(errState = er)
    if (canUpdate && !latest) return log("waiting for latest")
    if (current === -1) return log("waiting for current")
    // now we know the current version (or false if it's not there)
    // and have the version that it ought to be.
    var needsUpdate = canUpdate && current !== latest
    cb(null, current, needsUpdate)
  }
}

// deps is the package.json dependencies,
// plus any node_modules/* that aren't in the dependencies.
function getDeps (prefix, cb) {
  var jsonDeps
    , folderDeps

  readJson(path.resolve(prefix, "package.json"), function (er, data) {
    if (er) jsonDeps = {}
    else jsonDeps = data.dependencies || {}
    next()
  })

  fs.readdir(path.resolve(prefix, "node_modules"), function (er, list) {
    if (er) list = []
    folderDeps = list.reduce(function (l, r) {
      l[r] = "*"
      return l
    }, {}) || {}
    next()
  })

  function next () {
    log([jsonDeps, folderDeps], "getDeps next")
    if (!jsonDeps || !folderDeps) return
    Object.keys(jsonDeps).forEach(function (d) {
      folderDeps[d] = jsonDeps[d]
    })
    return cb(null, folderDeps)
  }
}
