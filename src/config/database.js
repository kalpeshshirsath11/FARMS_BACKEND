const mongoose = require("mongoose");

const dbConnection = async () => {
  try {
    // Connect to the database
    await mongoose.connect("mongodb+srv://HarshalB9:Q121jZH9ZwKIAnuY@farmscluster.gobhp.mongodb.net/FARMScluster");
    console.log("Database connected successfully");
  } catch (err) {
    console.error("Database connection failed:", err);
    throw err; 
  }
};

module.exports = { dbConnection };
