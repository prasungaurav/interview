// gridfs.js
const mongoose = require("mongoose");
const Grid = require("gridfs-stream");

let gfs;
let gridfsBucket;

function initGridFS(conn) {
  gridfsBucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: "videos" });
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection("videos");
  return { gfs, gridfsBucket };
}

module.exports = { initGridFS, getGfs: () => gfs, getBucket: () => gridfsBucket };
