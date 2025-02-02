const  FarmerStock = require("../models/FarmerStock.js")
const mongoose = require('mongoose');
const requstStatus = require('../models/RequestStatus.model.js');
const Transporter = require("../models/TransportRequirements.js");
const client = require("../utils/twilioClient.js");
const User = require("../models/User.js");
const { getCoordinates } = require("../services/geocodingService.js");

const findNearbyTransportRequirements = async (longitude, latitude, maxDistanceKm) => {
    try {
        const maxDistanceMeters = maxDistanceKm * 1000; // Convert km to meters

        const results = await Transporter.aggregate([
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [longitude, latitude],
                    },
                    distanceField: "distance",
                    maxDistance: maxDistanceMeters, // Maximum distance in meters
                    spherical: true,
                    key: "Departlocations.coordinates", // Ensure Departlocations is indexed properly
                }
            },
            
            
            {
                $sort: { distance: 1 } // Sort by nearest first
            }
        ]);

        console.log(results);
        return results;
    } catch (error) {
        console.error("Error finding transport requirements:", error);
    }
};

  
const getRequest = async (req, res) => {
    try {
        const { location, maxDistance} = req.body;

        // Validate input
        if (!location || !maxDistance ) {
            return res.status(400).json({
                success: false,
                message: "All fields are required",
            });
        }

        // Convert location to coordinates
        const locationCords = await getCoordinates(location);
        if (!locationCords || !locationCords.lat || !locationCords.lon) {
            return res.status(400).json({
                success: false,
                message: "Invalid location",
            });
        }

        // Find nearby transport requirements
        const data = await findNearbyTransportRequirements(
            locationCords.lon, // GeoJSON expects [longitude, latitude]
            locationCords.lat,
            maxDistance
        );

        if (!data) {
            return res.status(500).json({
                success: false,
                message: "Error fetching data",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Data retrieved successfully",
            data: data,
        });
    } catch (error) {
        console.error("Error in getRequest:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const requstStatusfunction = async (req, res) => {
    try {
        const _transportRequirementId = req.query.transportrequirementid;
        
        // Check if transport requirement ID is provided and valid
        if (!_transportRequirementId || !mongoose.Types.ObjectId.isValid(_transportRequirementId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid or missing transport requirement ID.",
            });
        }

        // Fetch transport requirement details
        const requirement = await Transporter.findById(_transportRequirementId);
        if (!requirement) {
            return res.status(404).json({
                success: false,
                message: "Transport requirement not found in the database.",
            });
        }

        // Ensure user (transporter) is logged in
        const _transporterId = req.user._id; // Assuming you're using authentication middleware that sets req.user
        if (!_transporterId) {
            return res.status(401).json({
                success: false,
                message: "Please log in as a transporter to proceed.",
            });
        }

        // Fetch transporter and farmer details
        const transporter = await User.findById(_transporterId);
        const _farmerId = requirement.FarmerIds;
        const farmer = await User.findById(_farmerId);

        if (!transporter || !farmer) {
            return res.status(404).json({
                success: false,
                message: "Transporter or farmer not found in the database.",
            });
        }

        const farmerContact = farmer.contactNumber;
        const transporterContact = transporter.contactNumber;

        // Check if departLocation and deliveryLocation are valid
        const depart = requirement.Departlocations;
        const dest = requirement.Destination;

        if (!dest || !dest.place || !dest.coordinates) {
            return res.status(400).json({
                success: false,
                message: "Missing or incomplete location information.",
            });
        }

        // Create acceptance deal
        const acceptance = await requstStatus.create({
            Transporterid: _transporterId,
            Farmerid: _farmerId,
            Departlocation:depart,
            Destination:dest,
            DepatrureDate: requirement.DepatrureDate,
            quantity: requirement.quantities,
        });

        await Transporter.deleteOne({ _id: _transportRequirementId });

        // Send SMS notifications using Twilio
        try {
            await client.messages.create({
                from: process.env.TWILIO_PHONE_NUMBER,
                to: transporterContact,
                body: `Greetings from F.A.R.M.S! 
Your deal with Farmer ${farmer.firstName} ${farmer.lastName} is confirmed for the date ${requirement.DepatrureDate}. 
You can contact the farmer through the app.`,
            });

            await client.messages.create({
                from: process.env.TWILIO_PHONE_NUMBER,
                to: farmerContact,
                body: `Greetings from F.A.R.M.S! 
Your deal with Transporter ${transporter.firstName} ${transporter.lastName} is confirmed for the date ${requirement.DepatrureDate}. 
You can contact the transporter through the app.`,
            });
        } catch (twilioError) {
            console.error("Twilio Error:", twilioError);
            return res.status(500).json({
                success: false,
                message: "Failed to send notification messages.",
            });
        }

        // Successful response
        return res.status(200).json({
            success: true,
            message: "Deal is accomplished.",
            deal: acceptance,
        });
    } catch (error) {
        console.error("Error in requestStatusFunction:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error.",
        });
    }
};










module.exports = { getRequest, requstStatusfunction };
