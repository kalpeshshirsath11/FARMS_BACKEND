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
const {ConsumerRequirements} = require("../models/ConsumerRequirements.js")
const cron = require("node-cron");
const moment = require("moment");

require("dotenv").config();

exports.postStock = async (req, res) => {
   try{
    const {cropname, cropgrade, quantity, location, contactNumber} = req.body;  //location should be comma separated village,district and state
    let {minExpectedPrice} = req.body;
   
    const farmerDetails = req.user;

    if(!cropname || !cropgrade || !quantity || !location || !minExpectedPrice ){
        console.log("err 1")
        return res.status(400).json({
            success:false,
            message:"All fields are required to post stock"
        });
    }

    minExpectedPrice = Number(minExpectedPrice);

    if(typeof minExpectedPrice !== "number"){
        return res.status(400).json({
            success:false,
            message:"Minimum expected price has to be a number."
        })
    }

    if(minExpectedPrice <= 0){
        return res.status(400).json({
            success:false,
            message:"Minimum expected price cannot be less than zero."
        })
    }

    const quantityValue = Number(quantity);
    if (quantityValue <= 0) {
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
// const finalLocation = `${location.village}, ${location.district}, ${location.state}`
    const locationcoordinates = await getCoordinates(location);   //!! FINAL_LOCATION
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
        minExpectedPrice: minExpectedPrice,
        image: uploadedImage.secure_url,
        location: {
            type:"Point",
            address:location,
            coordinates:[longi, lati]
        },
        contactNumber:contactNumber,
        pendingRetailerRequests:[],
        shopbuyers:[],
        directbuyers:[],
        sold:false
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
exports.viewBestDeals = async (req, res) => {
    try {
        const { farmerStockId } = req.query;
        const farmerStock = await FarmerStock.findById(farmerStockId);
        const { crop, cropGrade, location } = farmerStock;

        if (!crop || !cropGrade || !location) {
            return res.status(400).json({ success: false, message: "Crop, crop grade, and location are required." });
        }

        //clubbed requests of shopkeepers
        const matchedGroups = await retailerDemands.aggregate([
            { $match: { locked: false, crop : crop, cropGrade:cropGrade } },
            { $lookup:{
                from:"User",
                localField:"userId",
                foreignField:"_id",
                as:"retailerInfo"
            }},
            { $unwind: { path: "$retailerInfo", preserveNullAndEmptyArrays: true } },
            { $group: {
                _id: "$groupId",    
                totalQuantity: { $sum: "$quantity" },
                avgPrice: { $avg: "$pricePerQuintal" },
                avgGroupRating: { $avg: { $ifNull: ["$retailerInfo.averageRating", 0] } },
                retailers: { $push: "$$ROOT" } } }  
        ]);

        if (matchedGroups.length === 0) {
            return res.status(404).json({ success: false, message: "No matches found." });
        }

        const farmerCoordinates = location.coordinates;
        const k1 = 0.7, k2 = 0.15, k3 = 0.15;

        const deals = await Promise.all(matchedGroups.map(async (group) => {
            const {totalQuantity} = group;

            if(totalQuantity > farmerStock.quantity){
                return null;
            }

            const distances = await Promise.all(group.retailers.map(async (retailer) => {
                return calculateByRoadDistanceWithCoordinates(retailer.location.coordinates, farmerCoordinates);
            }));

            const minDistance = Math.min(...distances);
            const maxDistance = Math.max(...distances);

            if (typeof maxDistance !== "number" || isNaN(maxDistance)) return null;
            if (typeof minDistance !== "number" || isNaN(minDistance)) return null;
            
            const profitMargin = (group.avgPrice * group.totalQuantity) - (maxDistance * 7);
            const groupRating = group.avgGroupRating;
            if(groupRating == null){
                groupRating = 0;
            }
            const dealScore = parseFloat((k1 * profitMargin - k2 * maxDistance + k3 * groupRating).toFixed(2));
            
            return { groupId: group._id, dealScore, profitMargin, minDistance, maxDistance, groupRating, group };
        }));

        const filteredDeals = deals.filter((item) => item !== null);

        filteredDeals.sort((a, b) => b.dealScore - a.dealScore);

        return res.status(200).json({ success: true, message: "Best deals found!", filteredDeals });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Error finding best deals." });
    }
};


//REAL LIFE SCENARIO
//In a hurry to sell your crop ? Find the best deals near you !
exports.viewBestDealsInRange = async (req, res) => {
    try{
        const {farmerStockId} = req.query;
        const farmerStock = await FarmerStock.findById(farmerStockId);

        const {crop, cropGrade, location} = farmerStock;  
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

        if(!crop || !cropGrade || !location){
            return res.status(400).json({
                success:false,
                message:"To view best deals near you, crop, cropgrade, location and range are required fields"
            })
        }


        const matchedGroups = await retailerDemands.aggregate([
            { $match: { locked: false, crop : crop, cropGrade:cropGrade } },
            { $lookup:{
                from:"User",
                localField:"userId",
                foreignField:"_id",
                as:"retailerInfo"
            }},
            { $unwind: { path: "$retailerInfo", preserveNullAndEmptyArrays: true } },
            { $group: {
                _id: "$groupId",
                totalQuantity: { $sum: "$quantity" },
                avgPrice: { $avg: "$pricePerQuintal" },
                avgGroupRating: { $avg: { $ifNull: ["$retailerInfo.averageRating", 0] } },
                retailers: { $push: "$$ROOT" } } }  
        ]);

        if (matchedGroups.length === 0) {
            return res.status(404).json({ success: false, message: "No matches found." });
        }

        const farmerCoordinates = farmerStock.location.coordinates;

        const k1 = 0.7, k2 = 0.15, k3 = 0.15;

        const deals = await Promise.all(
            matchedGroups.map(async (group) => {

                const {totalQuantity} = group;

                if(totalQuantity > farmerStock.quantity){
                    return null;
                }

                const distances = await Promise.all(group.retailers.map(async (retailer) => {
                    return calculateByRoadDistanceWithCoordinates(retailer.location.coordinates, farmerCoordinates);
                }));

                const minDistance = Math.min(...distances);
                const maxDistance = Math.max(...distances);

                //keeping a buffer of 10km
                if (typeof maxDistance !== "number" || isNaN(maxDistance) || maxDistance > maxdist + 5) return null;
                if (typeof minDistance !== "number" || isNaN(minDistance)) return null;

                const quantityRequired = group.totalQuantity;
                const priceOffered = group.avgPrice;
                const groupRating = group.avgGroupRating;
                if(groupRating == null){
                    groupRating = 0;
                }
                
                //temporary - 7rs per km
                const profitMargin = (priceOffered * quantityRequired) - (maxDistance * 7);

                const dealScore = parseFloat(
                    (k1 * profitMargin - k2 * maxDistance + k3 * groupRating).toFixed(2)
                );


                //Return an object for every demand. Array of objects will be created.
                return { groupId: group._id, dealScore, profitMargin, minDistance, maxDistance, groupRating, group };
            })
        );

        const validDeals= deals.filter((item) => item !== null);

        // console.log(validDemandsWithScores);

        if(validDeals.length === 0){
            return res.status(404).json({
                success:false,
                message:`No matches found for the uploaded crop within ${maxdist} km. Please try again later.`
            })
        }
        
        validDeals.sort((a,b) => {
            return b.dealScore - a.dealScore;
        })

        return res.status(200).json({
            success:true,
            message:`Checkout the MOST PROFITABLE DEALS within range of ${maxdist} km !`,
            validDeals  //Use day.js for formatting the date from YYYY-MM-DD to DD-MM-YYYY 
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

// exports.requestTheGroupOfShopkeepers = async(req, res) => {
//     try{

//         const {groupId} = req.body;  //on clicking "Request Supply"
//         const {farmerStockId, maxDistance} = req.query;

//         const groupOfDemands = await retailerDemands.find({groupId});
//         if(!groupOfDemands || groupOfDemands.length === 0){
//             return res.status(404).json({
//                 success:false,
//                 message:"Group not found"
//             }) 
//         }

//         const currentBestScore = groupOfDemands[0].bestFarmerStockScore;

//         const farmerStock = await FarmerStock.findById(farmerStockId).populate('userId', 'averageRating reliabilityScore');

//         // console.log(farmerStock);

//         const {minExpectedPrice} = farmerStock;
//         const {averageRating, reliabilityScore} = farmerStock.userId;

//         const k1 = 0.55, k2 = 0.25, k3 = 0.1, k4 = 0.1;

//         const newBestScore = (k1 * (-minExpectedPrice)) + (k2 * reliabilityScore) - (k3 * maxDistance) + (k4 * averageRating);

//         if(newBestScore <= currentBestScore){
//             return res.status(200).json({
//                 success:true,
//                 message:"A better deal is already available for this group of requests. Please offer a better price or explore other deals!"
//             })
//         }

//         for(let demand of groupOfDemands){
//             demand.bestFarmerStockId = farmerStockId;
//             demand.bestFarmerStockScore = newBestScore;
//             await demand.save();
//         }

//         return res.status(200).json({
//             success:true,
//             message:"Requested successfully!"
//         }) 

//     } catch(error){
//         console.error(error);
//         return res.status(500).json({
//             success:false,
//             message:"Error in requesting the group of shopkeepers for supply."
//         })
//     }
// }

//When farmer clicks on "Request supply" on the BEST DEALS page
exports.requestTheGroupOfShopkeepers = async (req, res) => {
    try {
        const { groupId } = req.body;  // on clicking "Request Supply"
        const { farmerStockId, maxDistance } = req.query;

        const groupOfDemands = await retailerDemands.find({ groupId });
        if (!groupOfDemands || groupOfDemands.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Group not found"
            });
        }

        const farmerStock = await FarmerStock.findById(farmerStockId).populate('userId', 'averageRating reliabilityScore');

        if (!farmerStock) {
            return res.status(400).json({ success: false, message: "Invalid Farmer Stock ID" });
        }

        const { minExpectedPrice } = farmerStock;
        const { averageRating, reliabilityScore } = farmerStock.userId;

        const k1 = 0.55, k2 = 0.25, k3 = 0.1, k4 = 0.1;
        const dealScore = (k1 * (-minExpectedPrice)) + (k2 * reliabilityScore) - (k3 * maxDistance) + (k4 * averageRating);

        for (let demand of groupOfDemands) {
            // Push the request into pendingRequests array
            await retailerDemands.updateOne(
                { _id: demand._id },
                { $push: { pendingRequests: { farmerStockId, dealScore } } }
            );

            // Check if it's the best deal
            // if (dealScore > demand.bestFarmerStockScore) {
            //     demand.bestFarmerStockId = farmerStockId;
            //     demand.bestFarmerStockScore = dealScore;
            //     await demand.save();
            // }
        }

        return res.status(200).json({
            success: true,
            message: "Request submitted successfully!"
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error in requesting the group of shopkeepers for supply."
        });
    }
};


//In profile, when farmer clicks on "View Allocated Deals" button
exports.viewAllocatedDeals = async (req, res) => {
    try{

        const farmerId = req.user._id;

        const farmerInfo = await User.findById(farmerId).select('allocatedDeals');
        if (!farmerInfo) {
            return res.status(404).json({
                success: false,
                message: "Farmer not found."
            });
        }

        const {allocatedDeals} = farmerInfo;  //array which stores groupIds
        
        if(!allocatedDeals || allocatedDeals.length === 0){
            return res.status(200).json({
                success:true,
                message:"No deals have been allocated to you yet."
            })
        }

        return res.status(200).json({
            success:true,
            message:"Allocated deals fetched successfully",
            allocatedDeals
        })

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in fetching allocated deals for farmer."
        })
    }
}


exports.viewShopkeepersInAllocatedDeal = async (req, res) => {
    try{
        const {groupId} = req.query;

        const allShopkeepers = await retailerDemands.find({groupId}).select('location quantity contactNumber pricePerQuintal');

        if(!allShopkeepers || allShopkeepers.length === 0){
            return res.status(200).json({
                success:false,
                message:"No shopkeepers found for this deal."
            })
        }

        return res.status(200).json({
            success:true,
            message:"Shopkeepers fetched successfully",
            allShopkeepers
        })

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in fetching shopkeepers info in the allocated deal."
        })
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
// exports.acceptRetailerRequest = async (req, res) => {
//     try{        
        
//         const {notificationId} = req.query;    
//         if (!notificationId) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Notification ID is missing.",
//             });
//         } 


//         // const notification = await Notifications.findById(notificationId)
//         // .populate(['stockID', 'requirementId']);
//         const notification = await Notifications.findById(notificationId).select('stockID requirementId');
      
//         if (!notification) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Notification not found.",
//             });
//         }

//         // console.log(notification);
     
//         const retailerRequirementId = notification.requirementId.toString(); 
//         const farmerStockId = notification.stockID.toString(); 

//         // console.log(retailerRequirementId);
//         // console.log(farmerStockId);

       

        
//         const retailerRequirement = await retailerDemands.findById(retailerRequirementId);
//         if (!retailerRequirement) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Retailer requirement not found.",
//             });
//         }

//         //if retailer requirement is already accepted by other farmer before this farmer accepts the request 
//         if(retailerRequirement.accepted === true){
//             return res.status(200).json({
//                 success:false,
//                 message:"This retailer order is already accepted by other farmer."
//             })
//         }        
        
//         let updatedFarmerStock;
//         const session = await mongoose.startSession();
//         session.startTransaction();
//         try {

//             const updatedRetailerRequirement = await retailerDemands.findByIdAndUpdate(
//                 retailerRequirementId,
//                 {
//                     supplier:farmerStockId,
//                     accepted:true
//                 },
//                 {new:true, session}            
//             );

//             if (!updatedRetailerRequirement) {
//                 return res.status(404).json({
//                     success: false,
//                     message: "retailer requirement not found.",
//                 });
//             }

//             const farmerStock = await FarmerStock.findById(farmerStockId).select('quantity');
//             if (!farmerStock) {
//                 return res.status(404).json({
//                     success: false,
//                     message: "Farmer stock not found.",
//                 });
//             }
            

//             const updatedquantity = Math.max(0, farmerStock.quantity - updatedRetailerRequirement.quantity);

//             let updateFields = {
//                 $set: { quantity: updatedquantity }, 
//                 $pull:{pendingRetailerRequests : retailerRequirementId},
//                 $push: { shopbuyers: retailerRequirementId },
//             };
            
//             if (updatedquantity <= 0) {
//                 updateFields.$set.isFull = true; 
//             }

//             updatedFarmerStock = await FarmerStock.findOneAndUpdate(
//                 {_id:farmerStockId}, 
//                 updateFields,
//                 { new: true, session }
//             );

//             if (!updatedFarmerStock) {
//                 throw new Error("Failed to update farmer stock.");
//             }

//             const retailerId = updatedRetailerRequirement.userId;
//             const retailer = await User.findById(retailerId).select('contactNumber');
//             if (!retailer) {
//                 throw new Error("Retailer not found.")
//             }

//             const retailerContactNumber = retailer.contactNumber;

//             const farmerId = farmerStock.userId;
//             const farmer = await User.findById(farmerId).select('firstName lastName');
//             if (!farmer) {
//                 throw new Error("Farmer not found.")
//             }            

//             const {crop, quantity} = updatedRetailerRequirement;
//             const {firstName, lastName} = farmer;
//             const {expectedDeliveryDate} = updatedRetailerRequirement;

//             if (!expectedDeliveryDate || new Date(expectedDeliveryDate) < new Date()) {
//                 throw new Error("Expected delivery date is invalid or in the past.")
//             }

//             try {
//                 await client.messages.create({
//                     from: process.env.TWILIO_PHONE_NUMBER,
//                     to: retailerContactNumber,
//                     body: `Congratulations. Your request for ${quantity} kg of ${crop} has been accepted by ${firstName} ${lastName}. The produce will be delivered to your location on or before ${expectedDeliveryDate}.`
//                 });
//             } catch (twilioError) {
//                 console.error("Error sending SMS via Twilio to the retailer:", twilioError);
//                 // throw new Error("Failed to send SMS notification to the farmer.");  //Dont roll back for notification failure
//             }

//             await Notifications.findByIdAndDelete(notificationId, { session });

//             await session.commitTransaction();

//             return res.status(200).json({
//                 success:true,
//                 message:"Retailer request accepted successfully!",
//                 updatedFarmerStock
//             }) 
//         } catch (error) {
//             await session.abortTransaction();
//             console.error("Transaction error:", error);
//             return res.status(500).json({
//                 success: false,
//                 message: "Error in accepting retailer request.",
//             });
//         } finally {
//             await session.endSession();
//         }      
    
//     } catch(error){
//         console.error(error);
//         return res.status(500).json({
//             success: false,
//             message: "Error in accepting retailer request.",
//         });
//     }
// }

// //decline retailer request from notification 
// exports.declineRetailerRequest = async (req, res) => {
//     try{

//         const {notificationId} = req.query; 
//         if (!notificationId) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Notification ID is missing.",
//             });
//         }
        

//         const notification = await Notifications.findById(notificationId);
//         if (!notification) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Notification not found.",
//             });
//         }

//         const retailerRequirementId = notification.requirementId.toString();
//         const farmerStockId = notification.stockID.toString();


//         const retailerRequirement = await retailerDemands.findById(retailerRequirementId).select('userId crop quantity');
//         if(!retailerRequirement){
//             return res.status(404).json({
//                 success:false,
//                 message:"Retailer requirement not found."
//             })
//         }
//         const retailerId = retailerRequirement.userId;
//         const retailer = await User.findById(retailerId).select('contactNumber');
//         if(!retailer){
//             return res.status(404).json({
//                 success:false,
//                 message:"Retailer not found."
//             })
//         }
        
      
//         const session = await mongoose.startSession();
//         session.startTransaction();
//         try{
//             const farmerStock = await FarmerStock.findByIdAndUpdate(
//                 farmerStockId,
//                 {
//                     $pull:{
//                         pendingRetailerRequests:retailerRequirementId   // !!!MAKE SURE THAT WHEN RETAILER REQUESTS FOR THE CROP, HIS requirementId IS PUSHED AS A STRING AND NOT AS Object
//                     }
//                 },
//                 {
//                     new:true,
//                     session
//                 }
//             );

//             if(!farmerStock){
//                 throw new Error("Error in updating farmer stock");
//             }

           
//             const {crop, quantity} = retailerRequirement;

            
//             const retailerContactNumber = retailer.contactNumber;
//             if (!retailerContactNumber) {
//                 console.warn("Retailer contact number is missing. Skipping SMS notification.");
//             } else {
//                 try {
//                     await client.messages.create({
//                         from: process.env.TWILIO_PHONE_NUMBER,
//                         to: retailerContactNumber,
//                         body: `Your request for ${quantity} kg of ${crop} has been declined by the farmer. Kindly search for other deals on the platform.`,
//                     });
//                 } catch (twilioError) {
//                     console.error("Error sending SMS via Twilio:", twilioError);
//                     // No need to throw error here, as SMS failure should not roll back the transaction
//                 }
//             }
            

//             const deletedNotification = await Notifications.findByIdAndDelete(notificationId, { session });
//             if (!deletedNotification) {
//                 console.warn("Notification already deleted or not found.");
//             }

//             await session.commitTransaction();

//             return res.status(200).json({
//                 success: true,
//                 message: "Retailer request declined successfully.",
//             });
//         } catch(error){
//             await session.abortTransaction();
//             console.error("Transaction error:", error);
//             return res.status(500).json({
//                 success: false,
//                 message: "Error in declining retailer request.",
//             });
//         } finally{
//             await session.endSession();
//         }

//     } catch(error){
//         console.error(error);
//         return res.status(500).json({
//             success: false,
//             message: "Error in declining retailer request.",
//         });
//     }
// }


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


// exports.viewPendingRetailerRequests = async (req, res) => {
//     try{

//         const {farmerStockId} = req.query;

//         const farmerStock = await FarmerStock
//         .findById(farmerStockId)
//         .select('pendingRetailerRequests');

//         if(!farmerStock){
//             return res.status(404).json({
//                 success:false,
//                 message:"Farmer stock not found for fetching pending requests"
//             })
//         }

//         const pendingRetailerRequests = farmerStock.pendingRetailerRequests;
//         // console.log(pendingRetailerRequests);

//         if(!pendingRetailerRequests || pendingRetailerRequests.length === 0){
//             return res.status(200).json({
//                 success:false,
//                 message:"No pending retailer requests for this crop."
//             })
//         }

//         return res.status(200).json({
//             success:true,
//             message:"Pending retailer requests fetched successfully.",
//             pendingRetailerRequests
//         })



//     } catch(error){
//         console.error(error);
//         return res.status(500).json({
//             success: false,
//             message: "Error in fetching pending retailer requests.",
//         });
//     }
// }

// exports.viewShopBuyers = async (req, res) => {
//     try{

//         const {farmerStockId} = req.query;

//         const farmerStock = await FarmerStock
//         .findById(farmerStockId)
//         .select('shopbuyers')
//         .populate('shopbuyers');

//         if(!farmerStock){
//             return res.status(404).json({
//                 success:false,
//                 message:"Farmer stock not found for fetching shopkeepers buying this crop."
//             })
//         }

//         const confirmedShopBuyers = farmerStock.shopbuyers;

//         if(!confirmedShopBuyers || confirmedShopBuyers.length === 0){
//             return res.status(200).json({
//                 success:false,
//                 message:"No shopkeepers have bought this crop yet."
//             })
//         }

//         return res.status(200).json({
//             success:true,
//             message:"Shopkeepers buying this crop fetched successfully.",
//             confirmedShopBuyers
//         })

//     } catch(error){
//         console.error(error);
//         return res.status(500).json({
//             success:false,
//             message:"Error in fetching Shopkeepers buying this crop."
//         })
//     }
// }


// exports.acceptRetailerRequestFromMyOrders = async (req, res) => {
//     try{

//         const {farmerStockId, retailerRequirementId} = req.query;
        
//         if(!farmerStockId || !retailerRequirementId){
//             return res.status(400).json({
//                 success:false,
//                 message:"Farmer ID or Retailer ID not found."
//             })
//         }

//         let updatedFarmerStock;
//         const session = await mongoose.startSession();
//         session.startTransaction();
//         try{
          
//             const updatedRetailerRequirement = await retailerDemands.findByIdAndUpdate(
//                 retailerRequirementId,
//                 {
//                     supplier:farmerStockId,
//                     accepted:true
//                 },
//                 {new:true, session}            
//             );

//             if (!updatedRetailerRequirement) {
//                 return res.status(404).json({
//                     success: false,
//                     message: "retailer requirement not found.",
//                 });
//             }

//             const farmerStock = await FarmerStock.findById(farmerStockId).select('quantity');
//             if (!farmerStock) {
//                 return res.status(404).json({
//                     success: false,
//                     message: "Farmer stock not found.",
//                 });
//             }
            

//             const updatedquantity = Math.max(0, farmerStock.quantity - updatedRetailerRequirement.quantity);

//             let updateFields = {
//                 $set: { quantity: updatedquantity }, 
//                 $pull:{pendingRetailerRequests : retailerRequirementId},
//                 $push: { shopbuyers: retailerRequirementId },
//             };
            
//             if (updatedquantity <= 0) {
//                 updateFields.$set.isFull = true; 
//             }

//             updatedFarmerStock = await FarmerStock.findOneAndUpdate(
//                 {_id:farmerStockId}, 
//                 updateFields,
//                 { new: true, session }
//             );

//             if(!updatedFarmerStock) {
//                 throw new Error("Failed to update farmer stock.");
//             }

//             // const updatedRetailerRequirement = await retailerDemands.findOneAndUpdate( 
//             //     {_id: retailerRequirementId},
//             //     {
//             //         $push:{
//             //             suppliers:farmerStockId
//             //         },
//             //         $pull:{
//             //             pendingRequests:farmerStockId
//             //         },
//             //         $inc:{
//             //             quantity:-farmerStock.quantity
//             //         }
//             //     },
//             //     {
//             //         new:true,
//             //         session
//             //     }
//             // )

//             // if(!updatedRetailerRequirement){
//             //     throw new Error("Error in updating the retailer requirements.")
//             // }


//             // //CHECK IF IT ROLLS BACK !! QUANTITY SHOULD BE SAME AS BEFORE, SHOULDNT BE DECREMENTED
//             // if(updatedRetailerRequirement.isFull === true){
//             //     throw new Error("Unable to accept retailer request. This retailer order is already full.")
//             // }

           
//             // if (updatedRetailerRequirement.quantity <= 0) {
//             //     await retailerDemands.findByIdAndUpdate(
//             //         retailerRequirementId,
//             //         { $set: { isFull: true } },
//             //         { session }
//             //     );
//             // }
            

//             const farmerId = farmerStock.userId;
//             const farmer = await User.findById(farmerId).select('firstName lastName');
//             if (!farmer) {
//                 throw new Error("Farmer not found.")
//             }
//             // const farmerContactNumber = farmer.contactNumber;

//             const retailerId = updatedRetailerRequirement.userId;
//             const retailer = await User.findById(retailerId).select('contactNumber');
//             if (!retailer) {
//                 throw new Error("Retailer not found.")
//             }
            

//             const {crop, quantity} = updatedRetailerRequirement;
//             const {firstName, lastName} = farmer;
//             const {contactNumber} = retailer;
//             const {expectedDeliveryDate} = updatedRetailerRequirement;

//             if (!expectedDeliveryDate || new Date(expectedDeliveryDate) < new Date()) {
//                 throw new Error("Expected delivery date is invalid or in the past.")
//             }

//             try {
//                 await client.messages.create({
//                     from: process.env.TWILIO_PHONE_NUMBER,
//                     to: contactNumber,
//                     body: `Congratulations. Your request for ${quantity} kg of ${crop} has been accepted by ${firstName} ${lastName} . Produce will be delivered to your location on or before ${expectedDeliveryDate}.`
//                 });
//             } catch (twilioError) {
//                 console.error("Error sending SMS to retailer via Twilio:", twilioError);  //If notification fails, dont roll back, just log the error
//             }

           
//             await session.commitTransaction();
//             return res.status(200).json({
//                 success:true,
//                 message:"Retailer request accepted successfully from MY STOCK page.",
//                 updatedFarmerStock
//             })

//         } catch(error){
//             await session.abortTransaction();
//             console.error('Transation error',error);
//             return res.status(500).json({
//                 success:false,
//                 message:"Error in accepting retailer request from MY STOCK page."
//             })
//         } finally{
//             await session.endSession();
//         }


//     } catch(error){
//         console.error(error);
//         return res.status(500).json({
//             success:false,
//             message:"Error in accepting retailer request from MY STOCK page."
//         })
//     }
// }


// exports.declineRetailerRequestFromMyOrders = async (req, res) => {
//     try{

//         const {farmerStockId, retailerRequirementId} = req.query;
        
//         if(!farmerStockId || !retailerRequirementId){
//             return res.status(400).json({
//                 success:false,
//                 message:"Farmer ID or Retailer ID not found."
//             })
//         }

//         const session = await mongoose.startSession();
//         session.startTransaction();
//         try{
//             const farmerStock = await FarmerStock.findByIdAndUpdate(
//                 farmerStockId,
//                 {
//                     $pull:{
//                         pendingRetailerRequests:retailerRequirementId
//                     },
                    
//                 },
//                 {new:true, session}
//             );

//             if(!farmerStock) {
//                 throw new Error("Farmer stock not found.");
//             }            

//             const farmerId = farmerStock.userId;
//             const farmer = await User.findById(farmerId).select('firstName lastName');
//             if (!farmer) {
//                 throw new Error("Farmer not found.")
//             }

//             const retailerRequirement = await retailerDemands.findById(retailerRequirementId).select('userId');
//             if(!retailerRequirement){
//                 throw new Error("Retailer requirement not found");
//             }

//             const retailerId = retailerRequirement.userId;
//             const retailer = await User.findById(retailerId).select('contactNumber');
//             if (!retailer) {
//                 throw new Error("Retailer not found.")
//             }
            

//             const {crop, quantity} = retailerRequirement;
//             const {firstName, lastName} = farmer;
//             const {contactNumber} = retailer;
           

//             try {
//                 await client.messages.create({
//                     from: process.env.TWILIO_PHONE_NUMBER,
//                     to: contactNumber,
//                     body: `Your request for ${quantity} kg of ${crop} has been declined by the ${firstName} ${lastName}. Kindly search for other deals on the platform.`
//                 });
//             } catch (twilioError) {
//                 console.error("Error sending SMS to retailer via Twilio:", twilioError);  //If notification fails, dont roll back, just log the error
//             }

//             await session.commitTransaction();
//             return res.status(200).json({
//                 success:true,
//                 message:"Retailer request declined successfully from MY STOCK page."
//             })

//         } catch(error){
//             await session.abortTransaction();
//             console.error('Transation error',error);
//             return res.status(500).json({
//                 success:false,
//                 message:"Error in declining retailer request from MY STOCK page."
//             })
//         } finally{
//             await session.endSession();
//         }

//     } catch(error){
//         console.error(error);
//         return res.status(500).json({
//             success:false,
//             message:"Error in declining retailer request from MY STOCK page."
//         })
//     }
// }

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
