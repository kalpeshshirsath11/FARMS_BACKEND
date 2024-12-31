const mongoose = require("mongoose");

const dbConnection = async () => {
  try {
    // Connect to the database
    await mongoose.connect("mongodb://127.0.0.1:27017/FARMS", {
      
    });
    console.log("Database connected successfully");
  } catch (err) {
    console.error("Database connection failed:", err);
    throw err; 
  }
};

module.exports = { dbConnection };
