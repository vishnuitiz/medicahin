const crypto = require('crypto');
const { MedicalRecord } = require('../models/MedicalRecord');
const { ActivityLog } = require('../models/ActivityLog');
const { AccessGrant } = require('../models/AccessGrant');
const { AccessRequest } = require('../models/AccessRequest');
const mongoose = require('mongoose');
const { getContract: getFabricContract } = require('../fabric/gateway');
const { uploadFile, getFile } = require('../ipfs/client');

const FABRIC_CHANNEL = process.env.FABRIC_CHANNEL || 'medical-channel';
const FABRIC_CHAINCODE = process.env.FABRIC_CHAINCODE || 'encryption';

const handleError = (res, error) => {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
};

const logActivity = async (userId, userRole, action, resourceType, resourceId, details = {}) => {
    try {
        await ActivityLog.create({ userId, userRole, action, resourceType, resourceId, details });
    } catch (error) {
        console.error('Failed to log activity:', error);
    }
};

const patientController = {
    async uploadRecord(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No file uploaded' });
            }

            const { patientId, providerId, description, title, type } = req.body;

            if (!title || !description) {
                return res.status(400).json({ success: false, error: 'Title and description are required' });
            }

            const cid = await uploadFile(req.file.buffer);
            const recordId = crypto.randomUUID();
            const medicalData = {
                cid,
                ipfsHash: cid,
                filename: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                timestamp: new Date().toISOString()
            };

            const contract = await getFabricContract(FABRIC_CHANNEL, FABRIC_CHAINCODE);
            const transaction = await contract.submitTransaction(
                'storeProtectedMedicalData',
                recordId,
                JSON.stringify(medicalData),
                providerId || patientId,
                patientId
            );

            const fabricResult = JSON.parse(new TextDecoder().decode(transaction));

            const record = new MedicalRecord({
                recordId,
                title,
                description,
                type: type || 'other',
                status: 'active',
                medicalData,
                providerId: providerId || patientId,
                patientId,
                protectionId: fabricResult.protectionId,
                blockchainTxHash: fabricResult.protectionId
            });

            await record.save();

            console.log(`📝 Saved record to MongoDB:`, {
                recordId: record.recordId,
                patientId: record.patientId,
                title: record.title,
                status: record.status
            });

            await logActivity(patientId, 'patient', 'upload', 'record', recordId, {
                title,
                type,
                filename: req.file.originalname,
                ipfsHash: cid,
                blockchainTxHash: fabricResult.protectionId
            });

            res.json({
                success: true,
                message: 'Medical record uploaded and secured successfully',
                record: {
                    id: record.recordId,
                    title: record.title,
                    description: record.description,
                    type: record.type,
                    status: record.status,
                    ipfsHash: cid,
                    blockchainTxHash: fabricResult.protectionId,
                    createdAt: record.createdAt
                }
            });
        } catch (error) {
            handleError(res, error);
        }
    },

    async getRecords(req, res) {
        try {
            const { patientId } = req.params;
            const { status } = req.query;

            const query = { patientId };
            if (status && status !== 'all') {
                query.status = status;
            }

            const records = await MedicalRecord.find(query).sort({ createdAt: -1 }).lean();

            console.log(`🔍 Fetching records with query:`, query);
            console.log(`📊 Found ${records.length} records`);
            if (records.length > 0) {
                console.log(`📋 First record:`, {
                    recordId: records[0].recordId,
                    patientId: records[0].patientId,
                    title: records[0].title
                });
            }

            res.json({
                success: true,
                records: records.map(r => ({
                    id: r.recordId,
                    title: r.title,
                    description: r.description,
                    type: r.type,
                    status: r.status,
                    fileName: r.medicalData?.filename,
                    fileSize: r.medicalData?.size,
                    ipfsHash: r.medicalData?.ipfsHash,
                    blockchainTxHash: r.blockchainTxHash,
                    providerId: r.providerId,
                    providerType: r.providerId === patientId ? 'patient' : 'diagnostic',
                    createdAt: r.createdAt,
                    updatedAt: r.updatedAt
                }))
            });
        } catch (error) {
            handleError(res, error);
        }
    },

    async updateRecord(req, res) {
        try {
            const { recordId } = req.params;
            const { title, description, patientId } = req.body;

            const record = await MedicalRecord.findOne({ recordId });

            if (!record) {
                return res.status(404).json({ success: false, error: 'Record not found' });
            }

            if (title) record.title = title;
            if (description) record.description = description;
            record.updatedAt = new Date();

            await record.save();

            await logActivity(patientId || record.patientId, 'patient', 'edit', 'record', recordId, {
                title,
                description
            });

            res.json({
                success: true,
                message: 'Record updated successfully',
                record: {
                    id: record.recordId,
                    title: record.title,
                    description: record.description,
                    updatedAt: record.updatedAt
                }
            });
        } catch (error) {
            handleError(res, error);
        }
    },

    async toggleArchiveRecord(req, res) {
        try {
            const { recordId } = req.params;
            const { patientId } = req.body;

            const record = await MedicalRecord.findOne({ recordId });

            if (!record) {
                return res.status(404).json({ success: false, error: 'Record not found' });
            }

            const newStatus = record.status === 'active' ? 'archived' : 'active';
            record.status = newStatus;
            record.updatedAt = new Date();

            await record.save();

            await logActivity(patientId || record.patientId, 'patient', newStatus === 'archived' ? 'archive' : 'unarchive', 'record', recordId, {
                title: record.title
            });

            res.json({
                success: true,
                message: `Record ${newStatus === 'archived' ? 'archived' : 'unarchived'} successfully`,
                record: {
                    id: record.recordId,
                    status: record.status
                }
            });
        } catch (error) {
            handleError(res, error);
        }
    },

    async deleteRecord(req, res) {
        try {
            const { recordId } = req.params;
            const { patientId } = req.query;

            const record = await MedicalRecord.findOneAndDelete({ recordId });

            if (!record) {
                return res.status(404).json({ success: false, error: 'Record not found' });
            }

            await logActivity(patientId || record.patientId, 'patient', 'delete', 'record', recordId, {
                title: record.title
            });

            res.json({
                success: true,
                message: 'Record deleted successfully'
            });
        } catch (error) {
            handleError(res, error);
        }
    },

    async getActivityLog(req, res) {
        try {
            const { patientId } = req.params;
            const { action } = req.query;

            const query = { userId: patientId };
            if (action && action !== 'all') {
                // Handle comma-separated actions (e.g., "grant_access,revoke_access")
                if (action.includes(',')) {
                    query.action = { $in: action.split(',') };
                } else {
                    query.action = action;
                }
            }

            const activities = await ActivityLog.find(query)
                .sort({ timestamp: -1 })
                .limit(100)
                .lean();

            res.json({
                success: true,
                activities: activities.map(a => ({
                    id: a._id,
                    action: a.action,
                    resourceType: a.resourceType,
                    resourceId: a.resourceId,
                    details: a.details,
                    timestamp: a.timestamp
                }))
            });
        } catch (error) {
            handleError(res, error);
        }
    },

    async grantConsent(req, res) {
        try {
            const { patientId, providerId, providerRole, reason } = req.body;

            if (!patientId || !providerId || !reason) {
                return res.status(400).json({
                    success: false,
                    error: 'Patient ID, Provider ID, and reason are required'
                });
            }

            const User = mongoose.model('User');
            const provider = await User.findOne({
                $or: [
                    { providerId: providerId },
                    { email: providerId }
                ]
            });

            const providerName = provider ? provider.name : providerId;

            const grantId = crypto.randomUUID();
            const accessGrant = new AccessGrant({
                grantId,
                patientId,
                providerId,
                providerRole,
                providerName,
                reason,
                status: 'active'
            });

            await accessGrant.save();

            await logActivity(patientId, 'patient', 'grant_access', 'access', providerId, {
                providerRole,
                providerName,
                providerId,
                reason
            });

            res.json({
                success: true,
                message: 'Access granted successfully',
                data: {
                    grantId,
                    patientId,
                    providerId,
                    providerName,
                    providerRole,
                    reason,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            handleError(res, error);
        }
    },

    async getAccessGrants(req, res) {
        try {
            const { patientId } = req.params;

            // Only fetch active grants (exclude revoked)
            const grants = await AccessGrant.find({ patientId, status: 'active' }).sort({ grantedAt: -1 }).lean();

            res.json({
                success: true,
                grants: grants.map(g => ({
                    id: g.grantId,
                    providerId: g.providerId,
                    providerRole: g.providerRole,
                    providerName: g.providerName,
                    reason: g.reason,
                    status: g.status,
                    grantedAt: g.grantedAt,
                    revokedAt: g.revokedAt
                }))
            });
        } catch (error) {
            handleError(res, error);
        }
    },

    async revokeAccess(req, res) {
        try {
            const { grantId } = req.params;
            const { patientId } = req.body;

            const grant = await AccessGrant.findOne({ grantId });

            if (!grant) {
                return res.status(404).json({ success: false, error: 'Access grant not found' });
            }

            grant.status = 'revoked';
            grant.revokedAt = new Date();

            await grant.save();

            await logActivity(patientId || grant.patientId, 'patient', 'revoke_access', 'access', grant.providerId, {
                providerRole: grant.providerRole,
                providerName: grant.providerName,
                providerId: grant.providerId
            });

            res.json({
                success: true,
                message: 'Access revoked successfully'
            });
        } catch (error) {
            handleError(res, error);
        }
    },

    async getIncomingRequests(req, res) {
        try {
            const { patientId } = req.params;

            const requests = await AccessRequest.find({ patientId })
                .sort({ requestedAt: -1 });

            res.json({
                success: true,
                requests: requests.map(r => ({
                    id: r._id,
                    requesterId: r.requesterId,
                    requesterRole: r.requesterRole,
                    requesterName: r.requesterName,
                    reason: r.reason,
                    status: r.status,
                    requestedAt: r.requestedAt,
                    approvedAt: r.approvedAt,
                    rejectedAt: r.rejectedAt
                }))
            });
        } catch (error) {
            handleError(res, error);
        }
    },

    async approveRequest(req, res) {
        try {
            const { requestId, patientId } = req.body;

            const request = await AccessRequest.findById(requestId);
            if (!request) {
                return res.status(404).json({ success: false, error: 'Request not found' });
            }

            request.status = 'approved';
            request.approvedAt = new Date();
            await request.save();

            // Generate grantId for AccessGrant
            const grantId = crypto.randomUUID();

            await AccessGrant.create({
                grantId,
                patientId,
                providerId: request.requesterId,
                providerRole: request.requesterRole,
                providerName: request.requesterName,
                status: 'active',
                reason: request.reason
            });

            await logActivity(
                patientId,
                'patient',
                'approve_request',
                'access_request',
                requestId,
                {
                    providerId: request.requesterId,
                    providerRole: request.requesterRole
                }
            );

            res.json({
                success: true,
                message: 'Access request approved'
            });
        } catch (error) {
            handleError(res, error);
        }
    },

    async rejectRequest(req, res) {
        try {
            const { requestId, patientId } = req.body;

            const request = await AccessRequest.findById(requestId);
            if (!request) {
                return res.status(404).json({ success: false, error: 'Request not found' });
            }

            request.status = 'rejected';
            request.rejectedAt = new Date();
            await request.save();

            await logActivity(
                patientId,
                'patient',
                'reject_request',
                'access_request',
                requestId,
                {
                    providerId: request.requesterId,
                    providerRole: request.requesterRole
                }
            );

            res.json({
                success: true,
                message: 'Access request rejected'
            });
        } catch (error) {
            handleError(res, error);
        }
    }
};

module.exports = patientController;
