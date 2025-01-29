const { ItemAssignmentContextImpl } = require("twilio/lib/rest/numbers/v2/regulatoryCompliance/bundle/itemAssignment");
const mongoose = require('mongoose');
const { upload } = require("../middlewares/multer.middleware.js");
const FarmerStock = require("../models/FarmerStock.js");
const { uploadOnCloudinary } = require("../utils/uploadToCloudinary.js");
const TransporterDemand = require('../models/TransportRequirements.js')
const retailerDemands = require("../models/RetailerRequirements.js")
const {getCoordinates} = require("../services/geocodingService.js")
const {calculateByRoadDistance} = require("../services/distanceCalculator.js");
// const RetailerRequirements = require("../models/RetailerRequirements.js");
const User = require("../models/User.js")
const UserNotifications = require("../models/UserNotifications.js");
const Notifications = require("../models/Notifications.js")
const client = require("../utils/twilioClient");
const validator = require("validator");

require("dotenv").config();

exports.postStock = async (req, res) => {
   try{
    const {cropname, cropgrade, quantity, location, contactNumber} = req.body;  //location should be comma separated village,district and state
   
    const farmerDetails = req.user;

    if(!cropname || !cropgrade || !quantity  ){
        return res.status(400).json({
            success:false,
            message:"All fields are required to post stock"
        });
    }

    const quantityValue = Number(quantity);
    if (quantityValue <= 0) {
        return res.status(400).json({
            success: false,
            message: "Quantity must be a positive number",
        });
    }

    if (!validator.isMobilePhone(contactNumber, 'any')) {
            return res.status(400).json({ error: "Invalid contact number" });
    }

    const image = req.file.path;
    if(!image){
        return res.json({errr:"Image is required"})
    }

    const uploadedImage = await uploadOnCloudinary(image);
    if (!uploadedImage || !uploadedImage.secure_url) {
        return res.status(500).json({
            success: false,
            message: "Failed to upload crop image to Cloudinary",
        });
    }

    const locationcoordinates = await getCoordinates(location);
    if (!locationcoordinates) {
      return res.status(400).json({
        success: false,
        message: "Invalid location. Unable to retrieve coordinates.",
      });
    }
    // console.log(locationcoordinates);

    const longi  = locationcoordinates.lon;
    const lati  = locationcoordinates.lat;

    const newStock = await FarmerStock.create({
        userId: farmerDetails._id,
        crop: cropname, 
        cropGrade: cropgrade,
        quantity: quantity,
        image: uploadedImage.secure_url,
        location: {
            type:"Point",
            address:location,
            coordinates:[longi, lati]
        },
        contactNumber:contactNumber
    });

    return res.status(200).json({
        success: true,
        stock:newStock,   //When stock is posted, pass the ID of the posted stock as query parameter (to be accessed when farmer clicks on "Request supply" on the BEST DEALS page)
        message: "Stock posted successfully!",
    });
   } catch(error){
    console.log(error);
    return res.status(500).json({
        success: false,
        message: "Error in posting stock",
    });
   }
};


exports.viewMyStock = async (req, res) => {
    try {
        // const farmerDetails = req.user;
        // const farmerId = farmerDetails._id;

        const farmerId = req.query;  //Farmer is logged in, so we can get _id from payload

        const myStock = await FarmerStock.find({ userId: farmerId }).sort({createdAt: -1});  //newest first

        if (!myStock || myStock.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No stocks posted yet.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Farmer stocks fetched successfully.",
            stocks: myStock, 
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error in fetching stocks posted by farmer.",
        });
    }
};


//MASTER STROKE !
exports.viewBestDeals = async(req, res) => {
    try{
        const {crop, cropgrade, quantity, location} = req.body;  //quantity is qty of stock posted by farmer, location is a string

        if(!crop || !cropgrade || !quantity || !location){
            return res.status(400).json({
                success:false,
                message:"To view best deals, crop, cropgrade, quantity, location are required fields"
            })
        }

        const matchedDemands = await retailerDemands.find({isFull:false ,crop:crop, cropGrade:cropgrade}).populate('userId', 'averageRating');  
        if(matchedDemands.length === 0){
            return res.status(404).json({
                success:false,
                message:"No matches found for the uploaded crop. Please try again later."
            })
        }
        
        const k1 = 0.7, k2 = 0.15, k3 = 0.15;

        const demandsWithScores = await Promise.all(
            matchedDemands.map(async (demand) => {  

                const priceOffered = demand.pricePerQuintal;
                const retailerRating = demand.userId?.averageRating || 0;
                const retailerLocation = demand.location.address;

                const distance = await calculateByRoadDistance(retailerLocation, location);
                
                //temporary - 7rs per km
                const profitMargin = (priceOffered * quantity) - (distance * 7);

                const dealScore = parseFloat(
                    (k1 * profitMargin - k2 * distance + k3 * retailerRating).toFixed(2)
                );


                //Return an object for every demand. Array of objects will be created.
                return { demand, dealScore };
            })
        );
        
        demandsWithScores.sort((a,b) => {
            return b.dealScore - a.dealScore;
        })

        return res.status(200).json({
            success:true,
            message:"Checkout the MOST PROFITABLE DEALS for your crop !",
            demandsWithScores   //Use day.js for formatting the date from YYYY-MM-DD to DD-MM-YYYY 
            /*// Install day.js via npm
            // npm install dayjs
            const dayjs = require('dayjs');

            const backendDate = "2025-01-27";
            const formattedDate = dayjs(backendDate).format('DD-MM-YYYY');
            console.log(formattedDate); // Outputs: 27-01-2025
            */
        })
    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in finding the best deals."
        })
    }
};


//REAL LIFE SCENARIO
//In a hurry to sell your crop ? Find the best deals near you !
exports.viewBestDealsInRange = async (req, res) => {
    try{

        const {crop, cropgrade, quantity, location, maxdist} = req.body;  //quantity is qty of stock posted by farmer, location is a string, maxdist is range in km

        if(maxdist <= 0 || typeof(maxdist) !== "number"){
            return res.status(400).json({
                success:false,
                message:"The range should be a positive number."
            })
        }

        //north to south distance of India is ~3200km
        if(maxdist > 3300){
            return res.status(400).json({
                success:false,
                message:"Too large range. Enter a smaller value."
            })
        }

        if(!crop || !cropgrade || !quantity || !location){
            return res.status(400).json({
                success:false,
                message:"To view best deals near you, crop, cropgrade, quantity, location and range are required fields"
            })
        }


        const matchedDemands = await retailerDemands.find({isFull:false ,crop:crop, cropGrade:cropgrade}).populate('userId', 'averageRating');


        if(matchedDemands.length === 0){
            return res.status(404).json({
                success:false,
                message:"No matches found for the uploaded crop. Please try again later."
            })
        }

        const k1 = 0.7, k2 = 0.15, k3 = 0.15;

        const demandsWithScores = await Promise.all(
            matchedDemands.map(async (demand) => {
               
                const priceOffered = demand.pricePerQuintal;
                const retailerRating = demand.userId.averageRating;
                const retailerLocation = demand.location.address;
                
                const distance = await calculateByRoadDistance(retailerLocation, location);

                if(distance > maxdist) return null;
                
                //temporary - 7rs per km
                const profitMargin = (priceOffered * quantity) - (distance * 7);

                const dealScore = parseFloat(
                    (k1 * profitMargin - k2 * distance + k3 * retailerRating).toFixed(2)
                );


                //Return an object for every demand. Array of objects will be created.
                return { demand, dealScore };
            })
        );

        const validDemandsWithScores = await demandsWithScores.filter((item) => item !== null);

        console.log(validDemandsWithScores);

        if(validDemandsWithScores.length === 0){
            return res.status(404).json({
                success:false,
                message:`No matches found for the uploaded crop within ${maxdist} km. Please try again later.`
            })
        }
        
        validDemandsWithScores.sort((a,b) => {
            return b.dealScore - a.dealScore;
        })

        return res.status(200).json({
            success:true,
            message:`Checkout the MOST PROFITABLE DEALS within range of ${maxdist} km !`,
            validDemandsWithScores  //Use day.js for formatting the date from YYYY-MM-DD to DD-MM-YYYY 
            /*// Install day.js via npm
            // npm install dayjs
            const dayjs = require('dayjs');

            const backendDate = "2025-01-27";
            const formattedDate = dayjs(backendDate).format('DD-MM-YYYY');
            console.log(formattedDate); // Outputs: 27-01-2025
            */
        })
         
    } catch(error){
        console.error("Error finding deals within range:", error);
        return res.status(500).json({
            success: false,
            message: "Error in finding the best deals within the given range.",
        });
    }
}

//When farmer clicks on "Request supply" on the BEST DEALS page
exports.requestSupply = async(req, res) => {
    try{

        const { farmerstockId, quantity, crop } = req.query; // Extract farmer stock details from query
        if (!farmerstockId || !quantity || !crop) {
            return res.status(400).json({
                success: false,
                message: "Farmer stock details are incomplete.",
            });
        }

        const {retailerRequirementId} = req.body;
        if (!retailerRequirementId) {
            return res.status(404).json({
                success: false,
                message: "Retailer requirement ID not found.",
            });
        }

        const retailerRequirement = await retailerDemands.findById(retailerRequirementId);
        console.log(retailerRequirement);
        if (!retailerRequirement) {
            return res.status(404).json({
                success: false,
                message: "Retailer requirement not found.",
            });
        }
     
        const retailerId = retailerRequirement.userId;

        const newNotif = await Notifications.create({
            body:`A farmer is interested in supplying ${quantity} quintals of ${crop}.`,  //There will be "View Details" button on the notification, which will redirect to a page which will display farmer stock info using farmerStockId. On that page, there will be "Accept" and "Decline" buttons."
            stockID:farmerstockId,
            requirementId:retailerRequirementId
        })

       
        let updatedNotification;
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            updatedNotification = await UserNotifications.findOneAndUpdate(
                { userId: retailerId },
                { $push: { notification: newNotif._id } },
                { new: true, upsert: true, session }
            );

            if (!retailerRequirement.pendingRequests.includes(farmerstockId)) {
                retailerRequirement.pendingRequests.push(farmerstockId);
                await retailerRequirement.save({ session });
            }

            await session.commitTransaction();
        } catch (error) {
            await session.abortTransaction();
            console.error("Error during transaction:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to update retailer requirement or notification.",
            });
        } finally {
            session.endSession();
        }
       

        const populatedRetailer = await User.findById(retailerId).select('contactNumber firstName lastName');
        if (!populatedRetailer) {
            return res.status(404).json({
                success: false,
                message: "Retailer not found.",
            });
        }

        const { contactNumber, firstName, lastName } = populatedRetailer;

        try {
            await client.messages.create({
                from: process.env.TWILIO_PHONE_NUMBER,
                to: contactNumber,
                body: `Hello ${firstName} ${lastName}.A farmer is interested in supplying ${quantity} quintals of ${crop}. Please check in-app notifications for more info.`,
            });
        } catch (twilioError) {
            console.error("Failed to send SMS notification to the retailer", twilioError);
            // return res.status(500).json({
            //     success: false,
            //     message: "Failed to send SMS notification to the retailer.However, your've been added to the pending requests of the order. Kindly check the app.",
            // });
        }

        return res.status(200).json({
            success:true,
            message:"Requested for supply successfully.",
            updatedNotification
        })

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error in requesting the retailer for supply",
        });
    }
}


exports.requestTransport = async(req,res)=>{
    //middlewares will check for is farmer uploading or authenticated
    //then farmer will provide information of crop
    //validate user information then upload it to database
    const {departLocation,deliveryLocation,dateOfJourney,capacity} = req.body;
    if(!departLocation || !deliveryLocation || !dateOfJourney || !capacity){
        return res.status(402).json({
            success: false,
            message: "please provide all Information ",

        })
    }
    const farmerDetails = req.user;
    if(!farmerDetails){
        return res.status(402).json({
            message:"farmer doesnt exist",
            success:"false",
        })
    }
    const FarmRequest = await TransporterDemand.create({
        departLocation,
        deliveryLocation,
        dateOfJourney,
        capacity,
        userId:farmerDetails._id
    })

    if(!FarmRequest){
        return res.status(402).json({
            success:false,
            message:"Error in uploading to database",
        })
    }
    return res.status(201).json({
        requestTransport:FarmRequest,
        success:true,
        message:"requestes successfully"
    })

}
