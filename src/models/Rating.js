const mongoose = require("mongoose");

const ratingReviewSchema = new mongoose.Schema({
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "reviewerModel",//ha ek trr transporter rahil kiva farmar
  },
  reviewerModel: {
    type: String,
    required: true,
    enum: ["Farmer", "Transporter"], // Who is leaving the review
  },
  reviewed: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "reviewedModel", //ha ek trr transporter rahil kiva farmar
  },
  reviewedModel: {
    type: String,
    required: true,
    enum: ["Farmer", "Transporter"], // Who is being reviewed
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  review: {
    type: String,
    trim: true,
  },
  
},{timestamps:true});

module.exports = mongoose.model("RatingReview", ratingReviewSchema);
