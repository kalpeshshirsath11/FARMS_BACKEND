const express = require("express");
require("dotenv").config();
const {dbConnection} = require("./config/database.js")
const {cloudinaryConnect} = require("./config/cloudinary.js")
const userRoute = require("./routes/user.routes.js");
const cookieParser = require("cookie-parser");
const PORT = process.env.PORT || 8000;
const app = express();
const farmRoute = require('./routes/farmer.routes.js')
const retailerRoute = require('./routes/retailer.routes.js')
const transportRoute = require('./routes/transporter.routes.js')
const {authorize, isFarmer, isRetailer, isTransporter} = require("./middlewares/auth.js")
const cors = require("cors")

require("./utils/lockDealsCron.js");   //schedule cron-job when server starts

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors({
  origin: "http://localhost:5175", // Frontend URL
  credentials: true, // 👈 Required for cookies to be stored
}));
app.use(cookieParser())



app.use("/api",userRoute);  //public routes
app.use('/farmer',authorize, isFarmer, farmRoute)
app.use('/retailer',authorize ,isRetailer, retailerRoute)
app.use('/transporter',authorize, isTransporter,transportRoute)


dbConnection()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("Error occurred in server starting process:", err);
  });
