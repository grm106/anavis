const fs = require('fs');
const path = require('path');
const ko = require('knockout');
const mkdirp = require('mkdirp');
const { remote } = require('electron');
const BigNumber = require('bignumber.js');
const koMapping = require('knockout-mapping');

const folderZip = require('./common/folder-zip');
const appViewModel = require('./app-view-model');
const defaultDocument = require('./default-document');

function create() {
  const documentDir = createTempDirectoryName();
  mkdirp.sync(documentDir);
  const content = JSON.stringify(defaultDocument.create());
  fs.writeFileSync(path.join(documentDir, 'anavis.json'), content, 'utf8');
  readDocument(documentDir, function (error, doc) {
    const workVm = createWorkViewModelFromDocunment(doc);
    workVm._ = {
      zipFileName: ko.observable(),
      workingDirectory: ko.observable(documentDir)
    };
    appViewModel.works.push(workVm);
  });
}

function open() {
  remote.dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'AnaVis document', extensions: ['avd'] }] }, function (filenames) {
    if (filenames && filenames.length) {
      if (appViewModel.works().some(x => x._.zipFileName() === filenames[0])) return;
      const unzipDir = createTempDirectoryName()
      openDocument(filenames[0], unzipDir, function (error, doc) {
        const workVm = createWorkViewModelFromDocunment(doc);
        workVm._ = {
          zipFileName: ko.observable(filenames[0]),
          workingDirectory: ko.observable(unzipDir)
        };
        appViewModel.works.push(workVm);
      })
    }
  });
}

function save(cb) {
  const work = appViewModel.currentWork();
  if (!work) return cb && cb();
  if (!work._.zipFileName()) {
    remote.dialog.showSaveDialog({ properties: ['saveFile'], filters: [{ name: 'AnaVis document', extensions: ['avd'] }] }, function (fileName) {
      console.log('fileName', fileName)
      if (fileName) {
        work._.zipFileName(fileName);
        save(cb);
      } else {
        return cb && cb();
      }
    });
  } else {
    const zipFileName = work._.zipFileName();
    const workingDirectory = work._.workingDirectory();
    const docFileName = path.normalize(path.join(workingDirectory, 'anavis.json'));
    const workJson = ko.toJSON(work);
    delete workJson['_'];
    fs.writeFile(docFileName, workJson, 'utf8', err => {
      if (err) return cb && cb(err);
      folderZip.zip(workingDirectory, zipFileName, cb);
    });
  }
}

function close() {
  const work = appViewModel.currentWork();
  if (work) {
    appViewModel.works.remove(work);
  }
}

function createTempDirectoryName() {
  const userDataDir = remote.app.getPath('userData');
  return path.join(userDataDir, 'temp-docs', `doc_${Date.now()}`);
}

function openDocument(filename, unzipDir, cb) {
  folderZip.unzip(filename, unzipDir, function (err) {
    if (err) return cb && cb(err);
    readDocument(unzipDir, cb);
  });
}

function readDocument(unzipDir, cb) {
  const docFileName = path.join(unzipDir, 'anavis.json');
  fs.readFile(docFileName, 'utf8', function (err, content) {
    if (err) return cb && cb(err);
    return cb && cb(null, JSON.parse(content));
  });
}

function createWorkViewModelFromDocunment(doc) {
  consolidatePartLengths(doc);
  const workVm = koMapping.fromJS(doc);
  delete workVm['__ko_mapping__'];
  return workVm;
}

function consolidatePartLengths(doc) {
  const maxSum = 1000000;
  const sum = doc.parts.reduce((accu, part) => accu.plus(part.length.toString()), new BigNumber(0));
  const factor = new BigNumber(maxSum).dividedBy(sum).toNumber();
  doc.parts.forEach(part => { part.length *= factor; });
  return doc;
}

module.exports = { create, open, save, close };