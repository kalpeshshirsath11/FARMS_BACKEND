const mongoose = require("mongoose");

const farmerStockSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  crop: {
    type: String,
    required: true,
    trim: true,
  },
  cropGrade: {
    type: Number,
    enum: [1, 2, 3, 4],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  image: {
    type: String,
    required: true,
  },
  location: {
    depart: {
      type: {
        type: String, // GeoJSON type must be "Point"
        enum: ["Point"],
        // required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        // required: true,
      },
    },
    destination: {
      type: {
        type: String, // GeoJSON type must be "Point"
        enum: ["Point"],
        // required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        // required: true,
      },
    },
  },
}, { timestamps: true }); // Add timestamps option in schema definition

module.exports = mongoose.model("FarmerStock", farmerStockSchema); // Change model name for clarity
