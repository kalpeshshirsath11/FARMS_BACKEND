const TransporterDemand = require('../models/TransportRequirements.model.js')
const {getCoordinates} = require('../services/geocodingService.js')
const FarmerStock = require("../models/FarmerStock");
const mongoose = require('mongoose');
const client = require('../utils/twilioClient.js');
const Notification = require('../models/notification.model.js');
// const TransporterDemand = require('../models/TransportRequirements.model.js')
const requestTransport = async (req, res) => {
    try {
        const { departLocation, deliveryLocation, dateOfJourney, quantity } = req.body;

        
        
        const departCords = await getCoordinates(departLocation);
        const deliveryCords = await getCoordinates(deliveryLocation);
        if(!departCords || !deliveryCords){
            return res.status(501).json({
                err:"error in fetching"
            })
        }


        const farmerDetails = req.user; // Extract FarmerId from authentication middleware
        if (!farmerDetails) {
            return res.status(401).json({
                success: false,
                message: "Farmer does not exist or is not authenticated.",
            });
        }

        const FarmRequest = await TransporterDemand.create({
            FarmerIds: farmerDetails._id,
            Departlocations:{
                place:departLocation,
                coordinates:[departCords.lat,departCords.lon]
            },
            Destination:{
                place:deliveryLocation,
                coordinates:[deliveryCords.lat,deliveryCords.lon]
            },
            DepatrureDate: new Date(dateOfJourney),
            quantities:quantity,
        });

        return res.status(201).json({
            success: true,
            message: "Request submitted successfully.",
            requestTransport: FarmRequest,
        });
    } catch (error) {
        console.error("Error processing transport request:", error);
        return res.status(500).json({
            success: false,
            message: "An internal server error occurred.",
        });
    }
};

const tranportReqfarmer = async (req, res) => {
    try {
      const _myRequirementId = req.query.transportrequirementid;
  
      if (!_myRequirementId || !mongoose.Types.ObjectId.isValid(_myRequirementId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid or missing transport requirement ID.",
        });
      }
  
      const myInfo = await TransporterDemand.findById(_myRequirementId);
      if (!myInfo) {
        return res.status(404).json({
          success: false,
          message: "Transport demand not found.",
        });
      }
  
      // Define `getdemands` function
      const getdemands = async (departureCoordinates, destinationCoordinates, excludeId) => {
        return await TransporterDemand.aggregate([
          {
            // `$geoNear` must be the first stage in the pipeline
            $geoNear: {
              near: { type: "Point", coordinates: departureCoordinates },
              distanceField: "distanceToDeparture",
              maxDistance: 40000, // Distance in meters
              spherical: true,
            },
          },
          {
            $match: {
              _id: { $ne: new mongoose.Types.ObjectId(excludeId) }, // Exclude the given ID
            },
          },
          {
            $match: {
              "Destination.coordinates": destinationCoordinates, // Match destination
            },
          },
        ]);
      };
  
      // Get demands
      const demands = await getdemands(
        myInfo.Departlocations[0].coordinates, // Assuming Departlocations is an array
        myInfo.Destination.coordinates,
        _myRequirementId
      );
  
      if (!demands || demands.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No matching transport demands found.",
        });
      }
  
      // Successful response
      return res.status(200).json({
        success: true,
        data: demands,
      });
    } catch (err) {
      console.error("Error in processing:", err);
      return res.status(500).json({
        success: false,
        message: "An internal server error occurred.",
      });
    }
  };
  

  const reqFarmer = async (req, res) => {
    try {
      const _RequirementId = req.query.requstId;
      const _myrequirementId = req.query._myRequirementId;
  
      // Validate IDs
      if (!_myrequirementId || !mongoose.Types.ObjectId.isValid(_myrequirementId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid or missing transport requirement ID (_myRequirementId).",
        });
      }
      if (!_RequirementId || !mongoose.Types.ObjectId.isValid(_RequirementId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid or missing transport requirement ID (_RequirementId).",
        });
      }
  
      // Authenticate user
      const _requesterId = req.user?._id;
      if (!_requesterId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated.",
        });
      }
  
      // Fetch requester data
      const requesterDataInfo = await TransporterDemand.findById(_myrequirementId);
      if (!requesterDataInfo) {
        return res.status(404).json({
          success: false,
          message: "Requester data not found.",
        });
      }
  
      //Send SMS using Twilio
      
      requesterDataInfo.contactNumber.map(async(ele)=>{
        await client.messages.create({
          from: process.env.TWILIO_PHONE_NUMBER,
          to: ele,
          body:`Greetings from F.A.R.M.S!
  We are thrilled to share that our farmer friend
  is interested in sharing their trip with you.
  If you allow it, this could be beneficial for both parties.
  If you are interested, please accept the invitation.`
        })

      })
  
      // Fetch receiver data
      const receiver = await TransporterDemand.findById(_RequirementId);
      if (!receiver) {
        return res.status(404).json({
          success: false,
          message: "Receiver data not found.",
        });
      }
    
      // Create notification
      const notify = await Notification.create({
        _senderId: _requesterId,
        _receiverId: receiver.FarmerIds, // Ensure this is compatible with your Notification schema
        message: `Greetings from F.A.R.M.S!
  We are thrilled to share that our farmer friend
  is interested in sharing their trip with you.
  If you allow it, this could be beneficial for both parties.
  If you are interested, please accept the invitation.`,
        _farmerRequirementId: _RequirementId,
        _senderFarmerRequirementId: _myrequirementId,
      });
  
      if (!notify) {
        return res.status(500).json({
          success: false,
          message: "Failed to upload notifications.",
        });
      }
    
      // Success response
      return res.status(200).json({
        success: true,
        notification: notify,
        message: "Notification sent successfully.",
      });
    } catch (err) {
      console.error("Error in reqFarmer:", err);
      return res.status(500).json({
        success: false,
        message: "An internal server error occurred.",
      });
    }
  };
  

module.exports = {requestTransport,tranportReqfarmer,reqFarmer}
