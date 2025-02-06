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
const {calculateByRoadDistanceWithCoordinates} = require("../services/distanceCalcWithCoordinates.js")

require("dotenv").config();

exports.postStock = async (req, res) => {
   try{
    const {cropname, cropgrade, quantity, location, contactNumber} = req.body;  //location should be comma separated village,district and state
   
    const farmerDetails = req.user;

    if(!cropname || !cropgrade || !quantity  ){
        console.log("err 1")
        return res.status(400).json({
            success:false,
            message:"All fields are required to post stock"
        });
    }

    const quantityValue = Number(quantity);     
    if (quantityValue <= 0) {
        console.log("err2")
        return res.status(400).json({
            
            success: false,
            message: "Quantity must be a positive number",
        });
    }

    if (!validator.isMobilePhone(contactNumber, 'any')) {
        console.log("err 3")
            return res.status(400).json({ error: "Invalid contact number" });
    }

    if(!req.file){
        console.log("err 4")
        return res.status(400).json({
            success:false,
            message:"Req.file not found while posting stock"
        })
    }
    const image = req.file.path;
    if(!image){
        console.log('err 5')
        return resstatus(400).json({error:"Image is required"})
    }

    const uploadedImage = await uploadOnCloudinary(image);
    if (!uploadedImage || !uploadedImage.secure_url) {
        return res.status(500).json({
            success: false,
            message: "Failed to upload crop image to Cloudinary",
        });
    }
const finalLocation = `${location.village}, ${location.district}, ${location.state}`
    const locationcoordinates = await getCoordinates(finalLocation);
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
            address:finalLocation,
            coordinates:[longi, lati]
        },
        contactNumber:contactNumber,
        pendingRetailerRequests:[],
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


//MASTER STROKE !
exports.viewBestDeals = async(req, res) => {
    try{
        const {farmerStockId} = req.query;

        const farmerStock = await FarmerStock.findById(farmerStockId);

        const {crop, cropGrade, quantity, location} = farmerStock;  

        if(!crop || !cropGrade || !quantity || !location){
            return res.status(400).json({
                success:false,
                message:"To view best deals, crop, cropgrade, quantity, location are required fields"
            })
        }

        const matchedDemands = await retailerDemands.find({isFull:false ,crop:crop, cropGrade:cropGrade}).populate('userId', 'averageRating firstName lastName');  
        if(matchedDemands.length === 0){
            return res.status(404).json({
                success:false,
                message:"No matches found for the uploaded crop. Please try again later."
            })
        }

        const farmerCoordinates = location.coordinates;
        
        const k1 = 0.7, k2 = 0.15, k3 = 0.15;

        const demandsWithScores = await Promise.all(
            matchedDemands.map(async (demand) => {  

                const priceOffered = demand.pricePerQuintal;
                const retailerRating = demand.userId?.averageRating || 0;
                const retailerCoordinates = demand.location.coordinates;

                const distance = await calculateByRoadDistanceWithCoordinates(retailerCoordinates, farmerCoordinates);
                if (typeof distance !== "number" || isNaN(distance)) {
                    console.warn(`Warning: Could not calculate distance between retailer and farmer.`);
                    return null;  // Skip this deal from ranking
                }

                
                //temporary - 7rs per km
                const profitMargin = (priceOffered * quantity) - (distance * 7);

                //Consider vehicle cost +-10% for range of profit margin. 

                console.log("Profit: ", profitMargin);

                const dealScore = parseFloat(
                    (k1 * profitMargin - k2 * distance + k3 * retailerRating).toFixed(2)
                );


                //Return an object for every demand. Array of objects will be created.
                return { demand, dealScore, profitMargin };
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
        const {farmerStockId} = req.query;
        const farmerStock = await FarmerStock.findById(farmerStockId);

        const {crop, cropGrade, quantity, location} = farmerStock;  
        const {maxdist} = req.body;

        // maxdist = Number(maxdist);

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

        if(!crop || !cropGrade || !quantity || !location){
            return res.status(400).json({
                success:false,
                message:"To view best deals near you, crop, cropgrade, quantity, location and range are required fields"
            })
        }


        const matchedDemands = await retailerDemands.find({isFull:false ,crop:crop, cropGrade:cropGrade}).populate('userId', 'averageRating firstName lastName');


        if(matchedDemands.length === 0){
            return res.status(404).json({
                success:false,
                message:"No matches found for the uploaded crop. Please try again later."
            })
        }

        const farmerCoordinates = farmerStock.location.coordinates;

        const k1 = 0.7, k2 = 0.15, k3 = 0.15;

        const demandsWithScores = await Promise.all(
            matchedDemands.map(async (demand) => {
               
                const priceOffered = demand.pricePerQuintal;
                const retailerRating = demand.userId?.averageRating || 0;
                // const retailerLocation = demand.location.address;
                const retailerCoordinates = demand.location.coordinates;

                const distance = await calculateByRoadDistanceWithCoordinates(retailerCoordinates, farmerCoordinates);

                if(distance > maxdist) return null;
                
                //temporary - 7rs per km
                const profitMargin = (priceOffered * quantity) - (distance * 7);

                const dealScore = parseFloat(
                    (k1 * profitMargin - k2 * distance + k3 * retailerRating).toFixed(2)
                );


                //Return an object for every demand. Array of objects will be created.
                return { demand, dealScore, profitMargin };
            })
        );

        const validDemandsWithScores = demandsWithScores.filter((item) => item !== null);

        // console.log(validDemandsWithScores);

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


//-------------------------------------------------------------------------------------------

exports.viewFarmerNotifications = async (req, res) => {
    try{

        const {myId} = req.query;  //get it from payload

        const allNotifications = await UserNotifications.find({userId: myId}).populate('notification');

        if(!allNotifications || allNotifications.length === 0){
            return res.status(200).json({
                success:true,
                message:"No notifications pending."
            })
        }
        
        return res.status(200).json({
            success:true,
            message:"Farmer notifications fetched successfully.",
            allNotifications
        })

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in fetching farmer notifications."
        })
    }
}

//accept retailer request from notification 
exports.acceptRetailerRequest = async (req, res) => {
    try{        
        
        const {notificationId} = req.query;    
        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: "Notification ID is missing.",
            });
        } 


        // const notification = await Notifications.findById(notificationId)
        // .populate(['stockID', 'requirementId']);
        const notification = await Notifications.findById(notificationId).select('stockID requirementId');
      
        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found.",
            });
        }

        // console.log(notification);
     
        const retailerRequirementId = notification.requirementId.toString(); 
        const farmerStockId = notification.stockID.toString(); 

        // console.log(retailerRequirementId);
        // console.log(farmerStockId);

       

        
        const retailerRequirement = await retailerDemands.findById(retailerRequirementId);
        if (!retailerRequirement) {
            return res.status(404).json({
                success: false,
                message: "Retailer requirement not found.",
            });
        }

        //if retailer requirement is full before farmer accepts the request 
        if(retailerRequirement.isFull === true){
            return res.status(200).json({
                success:false,
                message:"This retailer order is already full."
            })
        }

        //If retailer himself has requested more stock, then no need to check
        // if(farmerStock.quantity > retailerRequirement.quantity) {
        //     return res.status(400).json({
        //         success: false,
        //         message: "Farmer stock quantity exceeds retailer's requirement.",
        //     });
        // }

        
        
        let updatedRetailerRequirement;
        const session = await mongoose.startSession();
        session.startTransaction();
        try {

            const farmerStock = await FarmerStock.findByIdAndUpdate(
                farmerStockId,
                {
                    $pull:{
                        pendingRetailerRequests: retailerRequirementId
                    },
                    confirmedRetailer:retailerRequirementId,
                    accepted:true
                },
                {new:true, session}            
            );

            if (!farmerStock) {
                return res.status(404).json({
                    success: false,
                    message: "Farmer stock not found.",
                });
            }

            const updatedquantity = retailerRequirement.quantity - farmerStock.quantity;

            let updateFields = {
                $inc: { quantity: -farmerStock.quantity },  //increment
                $push: { suppliers: farmerStockId },
                // $pull:{pendingRequests: farmerStockId}
            };
            
            if (updatedquantity <= 0) {
                updateFields.isFull = true; 
            }

            updatedRetailerRequirement = await retailerDemands.findOneAndUpdate(
                {_id:retailerRequirementId}, 
                updateFields,
                { new: true, session }
            );

            if (!updatedRetailerRequirement) {
                throw new Error("Failed to update retailer requirement.");
            }

            const retailerId = updatedRetailerRequirement.userId;
            const retailer = await User.findById(retailerId).select('contactNumber');
            if (!retailer) {
                throw new Error("Retailer not found.")
            }

            const retailerContactNumber = retailer.contactNumber;
            

            const {crop, quantity} = farmerStock;
            // const {firstName, lastName} = retailer;
            const {expectedDeliveryDate} = updatedRetailerRequirement;

            if (!expectedDeliveryDate || new Date(expectedDeliveryDate) < new Date()) {
                throw new Error("Expected delivery date is invalid or in the past.")
            }

            try {
                await client.messages.create({
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: retailerContactNumber,
                    body: `Congratulations. Your request for ${quantity} quintals of ${crop} has been accepted. The produce will be delivered to your location on or before ${expectedDeliveryDate}.`
                });
            } catch (twilioError) {
                console.error("Error sending SMS via Twilio to the retailer:", twilioError);
                // throw new Error("Failed to send SMS notification to the farmer.");  //Dont roll back for notification failure
            }

            await Notifications.findByIdAndDelete(notificationId, { session });

            await session.commitTransaction();

            return res.status(200).json({
                success:true,
                message:"Retailer request accepted successfully!",
                updatedRetailerRequirement
            }) 
        } catch (error) {
            await session.abortTransaction();
            console.error("Transaction error:", error);
            return res.status(500).json({
                success: false,
                message: "Error in accepting retailer request.",
            });
        } finally {
            await session.endSession();
        }      
    
    } catch(error){
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error in accepting retailer request.",
        });
    }
}

//decline retailer request from notification 
exports.declineRetailerRequest = async (req, res) => {
    try{

        const {notificationId} = req.query; 
        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: "Notification ID is missing.",
            });
        }
        

        const notification = await Notifications.findById(notificationId);
        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found.",
            });
        }

        const retailerRequirementId = notification.requirementId.toString();
        const farmerStockId = notification.stockID.toString();


        const retailerRequirement = await retailerDemands.findById(retailerRequirementId).select('userId');
        if(!retailerRequirement){
            return res.status(404).json({
                success:false,
                message:"Retailer requirement not found."
            })
        }
        const retailerId = retailerRequirement.userId;
        const retailer = await User.findById(retailerId).select('contactNumber');
        if(!retailer){
            return res.status(404).json({
                success:false,
                message:"Retailer not found."
            })
        }
        
      
        const session = await mongoose.startSession();
        session.startTransaction();
        try{
            const farmerStock = await FarmerStock.findByIdAndUpdate(
                farmerStockId,
                {
                    $pull:{
                        pendingRetailerRequests:retailerRequirementId   // !!!MAKE SURE THAT WHEN RETAILER REQUESTS FOR THE CROP, HIS requirementId IS PUSHED AS A STRING AND NOT AS Object
                    }
                },
                {
                    new:true,
                    session
                }
            );

            if(!farmerStock){
                throw new Error("Error in updating farmer stock");
            }

           
            const {crop, quantity} = farmerStock;

            
            const retailerContactNumber = retailer.contactNumber;
            if (!retailerContactNumber) {
                console.warn("Retailer contact number is missing. Skipping SMS notification.");
            } else {
                try {
                    await client.messages.create({
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: retailerContactNumber,
                        body: `Your request for ${quantity} quintals of ${crop} has been declined by the farmer. Kindly search for other deals on the platform.`,
                    });
                } catch (twilioError) {
                    console.error("Error sending SMS via Twilio:", twilioError);
                    // No need to throw error here, as SMS failure should not roll back the transaction
                }
            }
            

            const deletedNotification = await Notifications.findByIdAndDelete(notificationId, { session });
            if (!deletedNotification) {
                console.warn("Notification already deleted or not found.");
            }

            await session.commitTransaction();

            return res.status(200).json({
                success: true,
                message: "Retailer request declined successfully.",
            });
        } catch(error){
            await session.abortTransaction();
            console.error("Transaction error:", error);
            return res.status(500).json({
                success: false,
                message: "Error in declining retailer request.",
            });
        } finally{
            await session.endSession();
        }

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error in declining retailer request.",
        });
    }
}


exports.viewMyStock = async (req, res) => {
    try {
          //Farmer is logged in, so we can get _id from payload
        const farmerId = req.user._id;
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


exports.viewPendingRetailerRequests = async (req, res) => {
    try{

        const {farmerStockId} = req.query;

        const farmerStock = await FarmerStock
        .findById(farmerStockId)
        .select('pendingRetailerRequests');

        if(!farmerStock){
            return res.status(404).json({
                success:false,
                message:"Farmer stock not found for fetching pending requests"
            })
        }

        const pendingRetailerRequests = farmerStock.pendingRetailerRequests;
        console.log(pendingRetailerRequests);

        if(!pendingRetailerRequests || pendingRetailerRequests.length === 0){
            return res.status(200).json({
                success:false,
                message:"No pending retailer requests for this crop."
            })
        }

        return res.status(200).json({
            success:true,
            message:"Pending retailer requests fetched successfully.",
            pendingRetailerRequests
        })



    } catch(error){
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error in fetching pending retailer requests.",
        });
    }
}


exports.viewConfirmedRetailer = async (req, res) => {
    try{

        const {farmerStockId} = req.query;

        const farmerStock = await FarmerStock
        .findById(farmerStockId)
        .select('confirmedRetailer')
        .populate('confirmedRetailer');

        if(!farmerStock){
            return res.status(404).json({
                success:false,
                message:"Farmer stock not found for fetching confirmed retailer."
            })
        }

        const confirmedRetailer = farmerStock.confirmedRetailer;

        if(!confirmedRetailer){
            return res.status(200).json({
                success:false,
                message:"No confirmed retailer available for this crop yet."
            })
        }

        return res.status(200).json({
            success:true,
            message:"Confirmed retailer for this crop fetched successfully.",
            confirmedRetailer
        })

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in fetching confirmed retailer for this crop."
        })
    }
}


exports.acceptRetailerRequestFromMyOrders = async (req, res) => {
    try{

        const {farmerStockId, retailerRequirementId} = req.query;
        
        if(!farmerStockId || !retailerRequirementId){
            return res.status(400).json({
                success:false,
                message:"Farmer ID or Retailer ID not found."
            })
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try{
            const farmerStock = await FarmerStock.findByIdAndUpdate(
                farmerStockId,
                {
                    $pull:{
                        pendingRetailerRequests:retailerRequirementId
                    },
                    $set: {accepted: true, confirmedRetailer: retailerRequirementId }
                },
                {new:true, session}
            );

            if(!farmerStock) {
                throw new Error("Farmer stock not found.");
            }

            const updatedRetailerRequirement = await retailerDemands.findOneAndUpdate( 
                {_id: retailerRequirementId},
                {
                    $push:{
                        suppliers:farmerStockId
                    },
                    $pull:{
                        pendingRequests:farmerStockId
                    },
                    $inc:{
                        quantity:-farmerStock.quantity
                    }
                },
                {
                    new:true,
                    session
                }
            )

            if(!updatedRetailerRequirement){
                throw new Error("Error in updating the retailer requirements.")
            }


            //CHECK IF IT ROLLS BACK !! QUANTITY SHOULD BE SAME AS BEFORE, SHOULDNT BE DECREMENTED
            if(updatedRetailerRequirement.isFull === true){
                throw new Error("Unable to accept retailer request. This retailer order is already full.")
            }

           
            if (updatedRetailerRequirement.quantity <= 0) {
                await retailerDemands.findByIdAndUpdate(
                    retailerRequirementId,
                    { $set: { isFull: true } },
                    { session }
                );
            }
            

            const farmerId = farmerStock.userId;
            const farmer = await User.findById(farmerId).select('firstName lastName');
            if (!farmer) {
                throw new Error("Farmer not found.")
            }
            // const farmerContactNumber = farmer.contactNumber;

            const retailerId = updatedRetailerRequirement.userId;
            const retailer = await User.findById(retailerId).select('contactNumber');
            if (!retailer) {
                throw new Error("Retailer not found.")
            }
            

            const {crop, quantity} = farmerStock;
            const {firstName, lastName} = farmer;
            const {contactNumber} = retailer;
            const {expectedDeliveryDate} = updatedRetailerRequirement;

            if (!expectedDeliveryDate || new Date(expectedDeliveryDate) < new Date()) {
                throw new Error("Expected delivery date is invalid or in the past.")
            }

            try {
                await client.messages.create({
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: contactNumber,
                    body: `Congratulations. Your request for ${quantity} quintals of ${crop} has been accepted by ${firstName} ${lastName} . Produce will be delivered to your location on or before ${expectedDeliveryDate}.`
                });
            } catch (twilioError) {
                console.error("Error sending SMS to retailer via Twilio:", twilioError);  //If notification fails, dont roll back, just log the error
            }

           
            await session.commitTransaction();
            return res.status(200).json({
                success:true,
                message:"Retailer request accepted successfully from MY STOCK page."
            })

        } catch(error){
            await session.abortTransaction();
            console.error('Transation error',error);
            return res.status(500).json({
                success:false,
                message:"Error in accepting retailer request from MY STOCK page."
            })
        } finally{
            await session.endSession();
        }


    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in accepting retailer request from MY STOCK page."
        })
    }
}


exports.declineRetailerRequestFromMyOrders = async (req, res) => {
    try{

        const {farmerStockId, retailerRequirementId} = req.query;
        
        if(!farmerStockId || !retailerRequirementId){
            return res.status(400).json({
                success:false,
                message:"Farmer ID or Retailer ID not found."
            })
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try{
            const farmerStock = await FarmerStock.findByIdAndUpdate(
                farmerStockId,
                {
                    $pull:{
                        pendingRetailerRequests:retailerRequirementId
                    },
                    
                },
                {new:true, session}
            );

            if(!farmerStock) {
                throw new Error("Farmer stock not found.");
            }            

            const farmerId = farmerStock.userId;
            const farmer = await User.findById(farmerId).select('firstName lastName');
            if (!farmer) {
                throw new Error("Farmer not found.")
            }

            const retailerRequirement = await retailerDemands.findById(retailerRequirementId).select('userId');
            if(!retailerRequirement){
                throw new Error("Retailer requirement not found");
            }

            const retailerId = retailerRequirement.userId;
            const retailer = await User.findById(retailerId).select('contactNumber');
            if (!retailer) {
                throw new Error("Retailer not found.")
            }
            

            const {crop, quantity} = farmerStock;
            const {firstName, lastName} = farmer;
            const {contactNumber} = retailer;
           

            try {
                await client.messages.create({
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: contactNumber,
                    body: `Your request for ${quantity} quintals of ${crop} has been declined by the ${firstName} ${lastName}. Kindly search for other deals on the platform.`
                });
            } catch (twilioError) {
                console.error("Error sending SMS to retailer via Twilio:", twilioError);  //If notification fails, dont roll back, just log the error
            }

            await session.commitTransaction();
            return res.status(200).json({
                success:true,
                message:"Retailer request declined successfully from MY STOCK page."
            })

        } catch(error){
            await session.abortTransaction();
            console.error('Transation error',error);
            return res.status(500).json({
                success:false,
                message:"Error in declining retailer request from MY STOCK page."
            })
        } finally{
            await session.endSession();
        }

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in declining retailer request from MY STOCK page."
        })
    }
}

//DELETE NOTIFICATION FROM RR


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
