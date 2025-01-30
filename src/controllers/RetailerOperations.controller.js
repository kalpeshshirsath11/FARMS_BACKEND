const mongoose = require('mongoose');
const RetailerRequirements = require("../models/RetailerRequirements")
const {getCoordinates} = require("../services/geocodingService.js")
const FarmerStock = require('../models/FarmerStock.js');
const retailerDemands = require("../models/RetailerRequirements.js");
const UserNotifications = require("../models/UserNotifications.js");
const Notifications = require("../models/Notifications.js");
const client = require("../utils/twilioClient");
const User = require("../models/User.js");
require("dotenv").config()
const validator = require("validator");


exports.postRequirement = async (req, res) => {    
    try{
        const {crop, cropgrade, quantity, price, location, expectedDeliveryDate, contactNumber} = req.body;
        const retailerID = req.user._id;

        if(!crop || !cropgrade || !quantity || !price || !location || !contactNumber){
            return res.status(400).json({
                success:false,
                message:"All fields are required for posting crop requirements."
            })
        }

        if (!expectedDeliveryDate || isNaN(new Date(expectedDeliveryDate))) {
            return res.status(400).json({
                success: false,
                message: "A valid expected delivery date is required.",
            });
        }
        
        const deliveryDate = new Date(expectedDeliveryDate);
        // console.log(deliveryDate);
        
        if (deliveryDate < new Date()) {
            return res.status(400).json({
                success: false,
                message: "Expected delivery date cannot be in the past.",
            });
        }

        

        if (!validator.isMobilePhone(contactNumber, 'any')) {
            return res.status(400).json({ error: "Invalid contact number" });
        }


        if(quantity <= 0){
            return res.status(400).json({
                success:false,
                message:"Quantity cannot be negative or zero."
            })
        }

        if (price <= 0) {
            return res.status(400).json({
              success: false,
              message: "Price per quintal must be a positive value.",
            });
          }

          

        const locationcoordinates = await getCoordinates(location);
        if (!locationcoordinates) {
            return res.status(400).json({
                success: false,
                message: "Invalid location. Unable to retrieve coordinates.",
            });
        }
        const longi = locationcoordinates.lon;
        const lati = locationcoordinates.lat;
        // console.log(locationcoordinates);

        
        

        const newRequirement = await RetailerRequirements.create({
            userId:retailerID,
            crop:crop,
            cropGrade:cropgrade,
            pricePerQuintal:price,
            quantity:quantity,
            location:{
                type:"Point",
                address:location,
                coordinates:[longi, lati]
            },
            expectedDeliveryDate:deliveryDate,
            suppliers:[],
            pendingRequests:[]
        });

        return res.status(200).json({
            success:true,
            message:"Your crop requirement has been posted successfully.",
            newRequirement
        })        
    }
    catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"An error occured while posting stock requirement."
        })
    }
}

exports.viewNotifications = async (req, res) => {
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
            message:"Retailer notifications fetched successfully.",
            allNotifications
        })

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in fetching retailer notifications."
        })
    }
}


exports.acceptSupplyRequest = async (req, res) => {
    try{        
        
        const {notificationId} = req.query;  //When retailer clicks in the "View Details" button in the notification, extract the notificationId from there       
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

        const farmerStock = await FarmerStock.findById(farmerStockId);
        if (!farmerStock) {
            return res.status(404).json({
                success: false,
                message: "Farmer stock not found.",
            });
        }

        
        const retailerRequirement = await retailerDemands.findById(retailerRequirementId);
        if (!retailerRequirement) {
            return res.status(404).json({
                success: false,
                message: "Retailer requirement not found.",
            });
        }

        if(farmerStock.accepted === true){
            await Notifications.findByIdAndDelete(notificationId);
            
            const updatedRetailerRequirement = await retailerDemands.findByIdAndUpdate(
                retailerRequirementId,
                {
                    $pull:{
                        pendingRequests:farmerStockId
                    }
                },
                {new:true}
            )

            return res.status(200).json({
                success:false,
                message:"This stock is already accepted by another retailer."
            })
        }

        if(farmerStock.quantity > retailerRequirement.quantity) {
            return res.status(400).json({
                success: false,
                message: "Farmer stock quantity exceeds retailer's requirement.",
            });
        }

        const updatedquantity = retailerRequirement.quantity - farmerStock.quantity;

        let updateFields = {
            $inc: { quantity: -farmerStock.quantity },  //increment
            $push: { suppliers: farmerStockId },
            $pull:{pendingRequests: farmerStockId}
        };
        
        if (updatedquantity <= 0) {
            updateFields.isFull = true; 
        }
        
        let updatedRetailerRequirement;
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            updatedRetailerRequirement = await retailerDemands.findOneAndUpdate(
                {_id:retailerRequirementId}, 
                updateFields,
                { new: true, session }
            );

            if (!updatedRetailerRequirement) {
                throw new Error("Failed to update retailer requirement.");
            }

            await Notifications.findByIdAndDelete(notificationId, { session });

            const farmerId = farmerStock.userId;
            const farmer = await User.findById(farmerId).select('contactNumber');
            if (!farmer) {
                throw new Error("Farmer not found.")
            }
            const farmerContactNumber = farmer.contactNumber;

            const retailerId = updatedRetailerRequirement.userId;
            const retailer = await User.findById(retailerId).select('firstName lastName');
            if (!retailer) {
                throw new Error("Retailer not found.")
            }
            

            const {crop, quantity} = farmerStock;
            const {firstName, lastName} = retailer;
            const {expectedDeliveryDate} = updatedRetailerRequirement;

            if (!expectedDeliveryDate || new Date(expectedDeliveryDate) < new Date()) {
                throw new Error("Expected delivery date is invalid or in the past.")
            }

            try {
                await client.messages.create({
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: farmerContactNumber,
                    body: `Congratulations. Your request for the supply of ${quantity} quintals of ${crop} to ${firstName} ${lastName} has been accepted. Kindly deliver the produce on or before ${expectedDeliveryDate}.`
                });
            } catch (twilioError) {
                console.error("Error sending SMS via Twilio:", twilioError);
                // throw new Error("Failed to send SMS notification to the farmer.");  //Dont roll back for notification failure
            }

            farmerStock.accepted = true;
            try {
                await farmerStock.save();
            } catch (saveError) {
                throw new Error("Failed to update farmer stock status 'accepted'.");
            }

            await session.commitTransaction();

            return res.status(200).json({
                success:true,
                message:"Supply request accepted successfully!",
                updatedRetailerRequirement
            }) 
        } catch (error) {
            await session.abortTransaction();
            console.error("Transaction error:", error);
            return res.status(500).json({
                success: false,
                message: "Error in accepting supply request.",
            });
        } finally {
            await session.endSession();
        }      
    
    } catch(error){
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error in accepting supply request.",
        });
    }
}


exports.declineSupplyRequest  = async (req, res) => {
    try{

        const {notificationId} = req.query; 

        const notification = await Notifications.findById(notificationId);
        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found.",
            });
        }

        const retailerRequirementId = notification.requirementId;
        const farmerStockId = notification.stockID;

        let updatedRetailerRequirement;
        const session = await mongoose.startSession();
        session.startTransaction();
        try{

            updatedRetailerRequirement = await retailerDemands.findByIdAndUpdate(
                retailerRequirementId,
                {
                    $pull:{
                        pendingRequests:farmerStockId
                    }
                },
                {new:true, session}
            )

            if(!updatedRetailerRequirement){
                throw new Error("retailerRequirement not found.")
            }

            const farmerStock = await FarmerStock.findById(farmerStockId);
            if(!farmerStock){
                throw new Error("Farmer stock not found");
            }

            const farmerId = farmerStock.userId;
            const farmer = await User.findById(farmerId).select('contactNumber');
            if(!farmer){
                throw new Error("Farmer not found");
            }
            const {contactNumber} = farmer;
            const {crop, quantity} = farmerStock;

            const retailerId = updatedRetailerRequirement.userId;
            const retailer = await User.findById(retailerId).select('firstName lastName');
            if (!retailer) {
                throw new Error("Retailer not found")
            }

            const {firstName, lastName} = retailer;

            try{
                await client.messages.create({
                    from:process.env.TWILIO_PHONE_NUMBER,
                    to:contactNumber,
                    body:`Hello. Your request for the supply of ${quantity} quintals of ${crop} has been declined by Retailer ${firstName} ${lastName}. Kindly search for other deals on the platform.`
                });
            } catch (twilioError) {
                console.error("Error sending SMS via Twilio:", twilioError);
                // throw new Error("Failed to send SMS notification to the farmer.");   //Dont roll back for notification failure
            }

            await Notifications.findByIdAndDelete(notificationId, { session });
            await session.commitTransaction();

            return res.status(200).json({
                success: true,
                message: "Supply request declined successfully.",
            });
        } catch(error){
            await session.abortTransaction();
            console.error("Transaction error:", error);
            return res.status(500).json({
                success: false,
                message: "Error in declining supply request.",
            });
        } finally{
            await session.endSession();
        }

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error in declining supply request.",
        });
    }
}


exports.viewMyOrders = async (req, res) => {
    try{

        const {retailerId} = req.query;  //Retailer is logged in, so we can get _id from payload

        const myOrders = await retailerDemands.find({userId: retailerId}).sort({createdAt: -1});

        if(!myOrders || myOrders.length === 0){
            return res.status(200).json({
                success:false,
                message:"No orders posted yet."
            })
        }

        return res.status(200).json({
            success:true,
            message:"My orders fetched successfully",
            myOrders
        })

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in fetching retailer orders."
        })
    }
}

//When clicked on viewPendingRequests of a particular order in "View my orders"
exports.viewPendingRequests = async (req, res) => {
    try{

        const {retailerRequirementId} = req.query;

        const retailerRequirement = await retailerDemands
        .findById(retailerRequirementId)
        .select('pendingRequests');

        if(!retailerRequirement){
            return res.status(404).json({
                success:false,
                message:"Retailer requirement not found for fetching pending requests"
            })
        }

        const pendingRequests = retailerRequirement.pendingRequests;
        console.log(pendingRequests);

        if(!pendingRequests || pendingRequests.length === 0){
            return res.status(200).json({
                success:false,
                message:"No pending requests for this order."
            })
        }

        return res.status(200).json({
            success:true,
            message:"Pending requests fetched successfully.",
            pendingRequests
        })

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in fetching pending requests."
        })
    }
}


//When clicked on "View suppliers" of a particular order in "View my orders"
exports.viewSuppliersOfOrder = async (req, res) => {
    try{

        const {retailerRequirementId} = req.query;

        const retailerRequirement = await retailerDemands
        .findById(retailerRequirementId)
        .select('suppliers')
        .populate('suppliers');

        if(!retailerRequirement){
            return res.status(404).json({
                success:false,
                message:"Retailer requirement not found for fetching suppliers"
            })
        }

        const confirmedSuppliers = retailerRequirement.suppliers;

        if(!confirmedSuppliers || confirmedSuppliers.length === 0){
            return res.status(200).json({
                success:false,
                message:"No suppliers available for this order yet."
            })
        }

        return res.status(200).json({
            success:true,
            message:"Suppliers for this order fetched successfully.",
            confirmedSuppliers
        })

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in fetching suppliers for this order."
        })
    }
}


exports.acceptSupplyRequestFromMyOrders = async (req, res) => {
    try{

        const {farmerStockId, retailerRequirementId} = req.query;
        
        if(!farmerStockId || !retailerRequirementId){
            return res.status(400).json({
                success:false,
                message:"Farmer ID or Retailer ID not found."
            })
        }

        const farmerStock = await FarmerStock.findById(farmerStockId);
        if (!farmerStock) {
            return res.status(404).json({
                success: false,
                message: "Farmer stock not found.",
            });
        }
        
        if(farmerStock.accepted === true){
            const updatedRetailerRequirement = await retailerDemands.findByIdAndUpdate(
                retailerRequirementId,
                {
                    $pull:{
                        pendingRequests:farmerStockId
                    }
                },
                {new:true}
            )

            return res.status(200).json({
                success:false,
                message:"This stock is already accepted by another retailer."
            })
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try{
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

            if(updatedRetailerRequirement.quantity <= 0){
                updatedRetailerRequirement.isFull = true;
                await updatedRetailerRequirement.save({session});
            }

            const farmerId = farmerStock.userId;
            const farmer = await User.findById(farmerId).select('contactNumber');
            if (!farmer) {
                throw new Error("Farmer not found.")
            }
            const farmerContactNumber = farmer.contactNumber;

            const retailerId = updatedRetailerRequirement.userId;
            const retailer = await User.findById(retailerId).select('firstName lastName');
            if (!retailer) {
                throw new Error("Retailer not found.")
            }
            

            const {crop, quantity} = farmerStock;
            const {firstName, lastName} = retailer;
            const {expectedDeliveryDate} = updatedRetailerRequirement;

            if (!expectedDeliveryDate || new Date(expectedDeliveryDate) < new Date()) {
                throw new Error("Expected delivery date is invalid or in the past.")
            }

            try {
                await client.messages.create({
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: farmerContactNumber,
                    body: `Congratulations. Your request for the supply of ${quantity} quintals of ${crop} to ${firstName} ${lastName} has been accepted. Kindly deliver the produce on or before ${expectedDeliveryDate}.`
                });
            } catch (twilioError) {
                console.error("Error sending SMS via Twilio:", twilioError);  //If notification fails, dont roll back, just log the error
            }

            farmerStock.accepted = true;
            try {
                await farmerStock.save({session});
            } catch (saveError) {
                throw new Error("Failed to update farmer stock status isFull.");
            }


            await session.commitTransaction();
            return res.status(200).json({
                success:true,
                message:"Farmer stock accepted successfully"
            })

        } catch(error){
            await session.abortTransaction();
            console.error('Transation error',error);
            return res.status(500).json({
                success:false,
                message:"Error in accepting supply request from MY ORDERS."
            })
        } finally{
            await session.endSession();
        }

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in accepting supply request from MY ORDERS page"
        })
    }
}


exports.declineSupplyRequestFromMyOrders = async(req, res) => {
    try{

        const {farmerStockId, retailerRequirementId} = req.query;

        if(!farmerStockId || !retailerRequirementId){
            return res.status(400).json({
                success:false,
                message:"Farmer ID or Retailer ID not found."
            })
        }

        const farmerStock = await FarmerStock.findById(farmerStockId);
        if (!farmerStock) {
            return res.status(404).json({
                success: false,
                message: "Farmer stock not found.",
            });
        }


        const session = await mongoose.startSession();
        session.startTransaction();
        try{
            const updatedRetailerRequirement = await retailerDemands.findOneAndUpdate( 
                {_id: retailerRequirementId},
                { 
                    $pull:{
                        pendingRequests:farmerStockId
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

            const farmerId = farmerStock.userId;
            const farmer = await User.findById(farmerId).select('contactNumber');
            if (!farmer) {
                throw new Error("Farmer not found.")
            }
            const farmerContactNumber = farmer.contactNumber;

            const retailerId = updatedRetailerRequirement.userId;
            const retailer = await User.findById(retailerId).select('firstName lastName');
            if (!retailer) {
                throw new Error("Retailer not found.")
            }
            

            const {crop, quantity} = farmerStock;
            const {firstName, lastName} = retailer;

            try {
                await client.messages.create({
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: farmerContactNumber,
                    body: `Hello.
                    Your request for the supply of ${quantity} quintals of ${crop} has been declined by Retailer ${firstName} ${lastName}. Kindly search for other deals on the platform.`
                });
            } catch (twilioError) {
                console.error("Error sending SMS via Twilio:", twilioError);  //If notification fails, dont roll back, just log the error
            }

            await session.commitTransaction();
            return res.status(200).json({
                success:true,
                message:"Farmer stock declined successfully"
            })

        } catch(error){
            await session.abortTransaction();
            console.error('Transation error',error);
            return res.status(500).json({
                success:false,
                message:"Error in declining the supply request from MY ORDERS page."
            })
        } finally{
            await session.endSession();
        }
    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in declining the supply request from MY ORDERS page"
        })
    }
}

exports.deleteNotification = async (req, res) => {
    try {
        const {notificationId} = req.body; // From the "All notifications" page
        const { myId } = req.query; //user is logged in, so we can get this from payload

        if (!notificationId || !myId) {
            return res.status(400).json({
                success: false,
                message: "Missing notificationId or myId."
            });
        }

        const updatedUserNotification = await UserNotifications.findOneAndUpdate(
            { userId: myId },
            { $pull: { notification: notificationId } },
            { new: true }
        );

        if (!updatedUserNotification) {
            return res.status(404).json({
                success: false,
                message: "User notification record not found or notification not present."
            });
        }

        const deletedNotification = await Notifications.findByIdAndDelete(notificationId);

        if (!deletedNotification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Notification deleted successfully."
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Internal server error while deleting notification."
        });
    }
};


//------------------------------------------------------------------------------------------------

exports.viewBestFarmerOffers = async(req, res) => {
    try{
        const {crop, cropgrade, quantity} = req.body; 
        
                if(!crop || !cropgrade || !quantity){
                    return res.status(400).json({
                        success:false,
                        message:"To view best offers, crop, cropgrade, quantity, are required fields"
                    })
                }
        
                const matchedOffers = await FarmerStock.find({accepted:false ,crop:crop, cropGrade:cropgrade}).populate('userId'); 
                if(matchedOffers.length === 0){
                    return res.status(404).json({
                        success:false,
                        message:"No offers found for the uploaded requirement. Please try again later."
                    })
                }

                matchedOffers.sort((a, b) => {
                    const ratingA = a.userId?.averageRating || 0;
                    const ratingB = b.userId?.averageRating || 0;
                    return ratingB - ratingA;
                });
        
                return res.status(200).json({
                    success: true,
                    message: "Checkout the best offers!",
                    offers: matchedOffers 
                });


    } catch(error){
        console.error(error);
        return res.status(500).json({
            success:false,
            message:"Error in fetching the best farmer offers."
        })
    }
}


exports.requestFarmersCrop = async (req, res) => {
    try{

        const { retailerRequirementId} = req.query;
        if (!retailerRequirementId) {
            return res.status(400).json({
                success: false,
                message: "Retailer requirement Id not found.",
            });
        }

        const {farmerstockId} = req.body;
        if (!farmerstockId) {
            return res.status(404).json({
                success: false,
                message: "farmerstockId not found.",
            });
        }

        const farmerStock = await FarmerStock.findById(farmerstockId);
        // console.log(farmerStock);
        if (!farmerStock) {
            return res.status(404).json({
                success: false,
                message: "Farmer stock not found.",
            });
        }

        if(farmerStock.accepted === true){
            return res.status(200).json({
                success:true,
                message:"This stock has already been ordered by another retailer."
            })
        }

        const quantity = farmerStock.quantity;
        if(!quantity){
            return res.status(500).json({
                success:false,
                message:"Failed to fetch quantity of farmers crop."
            })
        }
        const crop = farmerStock.crop;
        if(!crop){
            return res.status(500).json({
                success:false,
                message:"Failed to fetch farmers crop."
            })
        }

        const farmerId = farmerStock.userId;

        const newNotif = await Notifications.create({
            body:`A retailer has requested ${quantity} quintals of your crop ${crop}. Checkout the offer.`,
            stockID:farmerstockId,
            requirementId:retailerRequirementId
        })

        let updatedNotification;
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            updatedNotification = await UserNotifications.findOneAndUpdate(
                { userId: farmerId },
                { $push: { notification: newNotif._id } },
                { new: true, upsert: true, session }
            );

            farmerStock.pendingRetailerRequests.push(retailerRequirementId);
            await farmerStock.save();

            await session.commitTransaction();
        } catch (error) {
            await session.abortTransaction();
            console.error("Error during transaction:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to update farmer notification.",
            });
        } finally {
            session.endSession();
        }

        const farmer = await User.findById(farmerId).select('contactNumber firstName lastName');
        if (!farmer) {
            return res.status(404).json({
                success: false,
                message: "Farmer not found.",
            });
        }

        const { contactNumber, firstName, lastName } = farmer;

        try {
            await client.messages.create({
                from: process.env.TWILIO_PHONE_NUMBER,
                to: contactNumber,
                body: `Hello ${firstName} ${lastName}.A retailer has requested ${quantity} quintals of your crop ${crop}. Please check in-app notifications for more info.`,
            });
        } catch (twilioError) {
            console.error("Failed to send SMS notification to the farmer", twilioError);
            // return res.status(500).json({
            //     success: false,
            //     message: "Failed to send SMS notification to the retailer.However, your've been added to the pending requests of the order. Kindly check the app.",
            // });
        }

        return res.status(200).json({
            success:true,
            message:"Successfully requested the farmer for his crop.",
            updatedNotification
        })

    } catch(error){
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error in requesting the farmer for his crop.",
        });
    }
}




// exports.getStock = async(req,res)=>{
//     //1.check for authentication and is user retailer using middleweres
//     //2. get all stocks from poststock database
//     //3.only send usaefull data to a retailer
//     const StockData = await FarmerStock.find({});
//     return res.status(201).json({
//         StockData
//     })
// }
