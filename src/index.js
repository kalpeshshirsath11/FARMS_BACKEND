const express = require("express");
require("dotenv").config();
const {dbConnection} = require("./config/database.js")
const {cloudinaryConnect} = require("./config/cloudinary.js")
const userRoute = require("./routes/user.routes.js");
const cookieParser = require("cookie-parser");
const PORT = process.env.PORT || 9000;
const app = express();
const farmRoute = require('./routes/farmer.routes.js')
const retailerRoute = require('./routes/retailer.routes.js')
const transportRoute = require('./routes/transporter.routes.js')
const consumerRoutes = require('./routes/consumer.routes.js')

const {authorize, isFarmer, isRetailer, isTransporter, isConsumer} = require("./middlewares/auth.js")
const cors = require("cors")

require("./utils/lockShopkeeperDealsCron.js");   //schedule cron-job when server starts
require("./utils/lockConsumerDealsCron.js");   //schedule cron-job when server starts
require("./utils/SendRegionWiseDataCron.js");
require("./utils/SendRetailerDemandDataCron.js")


app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors({
  origin: "https://farmsv0.onrender.com/", // Frontend URL
  credentials: true, //required for cookies to be stored
}));
app.use(cookieParser())



app.use("/api",userRoute);  //public routes
app.use('/farmer',authorize, isFarmer, farmRoute)
app.use('/retailer',authorize ,isRetailer, retailerRoute)
app.use('/transporter',authorize, isTransporter,transportRoute)
app.use('/consumer',authorize, isConsumer,consumerRoutes)

dbConnection()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("Error occurred in server starting process:", err);
  });