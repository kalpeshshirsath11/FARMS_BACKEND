const mongoose = require("mongoose")
const User = require("./User.js")

const transportRequirementSchema = new mongoose.Schema(
  {
    FarmerIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    Departlocations: [
      {
        type: {
          type: String,
          enum: ["Point"], // GeoJSON type must be "Point"
          default: "Point",
        },
        place: {
          type: String,
          required: true,
        },
        coordinates: {
          type: [Number], // Array of numbers: [longitude, latitude]
          required: true,
        },
      },
    ],
    Destination: {
      type: {
        type: String,
        enum: ["Point"], // GeoJSON type must be "Point"
        default: "Point",
      },
      place: {
        type: String,
        required: true,
      },
      coordinates: {
        type: [Number], // Array of numbers: [longitude, latitude]
        required: true,
      },
    },
    DepatrureDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    quantities: [
      {
        type: Number,
        required: true,
      },
    ],
    contactNumber:[{
    type:String,
    required:true
    }]

  },

  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
    expireAfterSeconds: 500, // Expires 500 seconds after creation
  }
);
transportRequirementSchema.index({ "Departlocations.coordinates": "2dsphere" });


module.exports = mongoose.model("Transporter", transportRequirementSchema);


