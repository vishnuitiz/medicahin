"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import PatientSidebar from "@/components/sidebars/PatientSidebar";
import { toast } from "react-hot-toast";

export default function PatientRecordsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
    const [uploadForm, setUploadForm] = useState({
        file: null as File | null,
        title: "",
        description: "",
        type: "lab_report",
    });
    const [editForm, setEditForm] = useState({
        recordId: "",
        title: "",
        description: "",
    });

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
        if (session?.user?.role !== "patient") {
            router.push("/");
        }
    }, [status, session, router]);

    useEffect(() => {
        if (session?.user?.patientId) {
            fetchRecords();
        }
    }, [session, activeTab]);

    const fetchRecords = async () => {
        try {
            console.log('[DEBUG] fetchRecords called, patientId:', session?.user?.patientId);
            console.log('[DEBUG] activeTab:', activeTab);
            console.log('[DEBUG] backendUrl:', backendUrl);

            setLoading(true);
            const url = `${backendUrl}/api/patient/records/${session?.user?.patientId}?status=${activeTab}`;
            console.log('[DEBUG] Fetching from:', url);

            const res = await fetch(url, {
                headers: {
                    'x-user-email': session?.user?.email || '',
                    'x-user-role': session?.user?.role || 'patient',
                    'x-patient-id': session?.user?.patientId || '',
                },
            });

            console.log('[DEBUG] Response status:', res.status);
            const data = await res.json();
            console.log('[DEBUG] Response data:', data);

            if (data.success) {
                console.log('[DEBUG] Setting records:', data.records?.length || 0);
                setRecords(data.records || []);
            } else {
                console.error('[DEBUG] Fetch failed:', data.error);
            }
        } catch (error) {
            console.error("Failed to fetch records:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadForm.file) {
            toast.error("Please select a file");
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", uploadForm.file);
            formData.append("title", uploadForm.title);
            formData.append("description", uploadForm.description);
            formData.append("type", uploadForm.type);
            formData.append("patientId", session?.user?.patientId || "");

            const res = await fetch(`${backendUrl}/api/patient/upload`, {
                method: "POST",
                headers: {
                    // Add session headers for backend authentication
                    'x-user-email': session?.user?.email || '',
                    'x-user-role': session?.user?.role || 'patient',
                    'x-patient-id': session?.user?.patientId || '',
                },
                body: formData,
            });

            const data = await res.json();

            if (data.success) {
                toast.success("Record uploaded successfully!");
                setShowUploadModal(false);
                setUploadForm({ file: null, title: "", description: "", type: "lab_report" });
                fetchRecords();
            } else {
                toast.error(data.error || "Upload failed");
            }
        } catch (error: any) {
            console.error("Upload error:", error);
            toast.error("Upload failed. Please check backend connection.");
        } finally {
            setUploading(false);
        }
    };

    const handleEdit = (record: any) => {
        setEditForm({
            recordId: record.id,
            title: record.title,
            description: record.description,
        });
        setShowEditModal(true);
    };

    const handleUpdateRecord = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${backendUrl}/api/patient/records/${editForm.recordId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    'x-user-email': session?.user?.email || '',
                    'x-user-role': session?.user?.role || 'patient',
                    'x-patient-id': session?.user?.patientId || '',
                },
                body: JSON.stringify({
                    title: editForm.title,
                    description: editForm.description,
                    patientId: session?.user?.patientId,
                }),
            });

            const data = await res.json();

            if (data.success) {
                toast.success("Record updated successfully!");
                setShowEditModal(false);
                fetchRecords();
            } else {
                toast.error(data.error || "Update failed");
            }
        } catch (error) {
            console.error("Update error:", error);
            toast.error("Update failed");
        }
    };

    const handleToggleArchive = async (recordId: string) => {
        try {
            const res = await fetch(`${backendUrl}/api/patient/records/${recordId}/archive`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    'x-user-email': session?.user?.email || '',
                    'x-user-role': session?.user?.role || 'patient',
                    'x-patient-id': session?.user?.patientId || '',
                },
                body: JSON.stringify({
                    patientId: session?.user?.patientId,
                }),
            });

            const data = await res.json();

            if (data.success) {
                toast.success(data.message);
                fetchRecords();
            } else {
                toast.error(data.error || "Operation failed");
            }
        } catch (error) {
            console.error("Archive error:", error);
            toast.error("Operation failed");
        }
    };

    const handleDelete = async (recordId: string) => {
        if (!confirm("Are you sure you want to delete this record? This action cannot be undone.")) {
            return;
        }

        try {
            const res = await fetch(`${backendUrl}/api/patient/records/${recordId}?patientId=${session?.user?.patientId}`, {
                method: "DELETE",
                headers: {
                    'x-user-email': session?.user?.email || '',
                    'x-user-role': session?.user?.role || 'patient',
                    'x-patient-id': session?.user?.patientId || '',
                },
            });

            const data = await res.json();

            if (data.success) {
                toast.success("Record deleted successfully!");
                fetchRecords();
            } else {
                toast.error(data.error || "Delete failed");
            }
        } catch (error) {
            console.error("Delete error:", error);
            toast.error("Delete failed");
        }
    };

    if (status === "loading" || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-cyan-600 text-xl">Loading...</div>
            </div>
        );
    }

    if (!session || session.user.role !== "patient") {
        return null;
    }

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Reusable Sidebar */}
            <PatientSidebar
                currentPath={pathname}
                userName={session.user.name || ""}
                userEmail={session.user.email || ""}
                patientId={session.user.patientId || ""}
            />

            {/* Main Content */}
            <main className="flex-1 ml-64 p-8 overflow-y-auto">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="mb-8 flex justify-between items-start">
                        <div>
                            <h2 className="text-3xl font-bold text-gray-900">Medical Records</h2>
                            <p className="text-gray-600 mt-1">Securely manage and view patient medical records.</p>
                        </div>
                        {/* Upload Button Moved Here */}
                        <button
                            onClick={() => setShowUploadModal(true)}
                            className="px-6 py-2.5 bg-cyan-600 text-white rounded-lg font-medium hover:bg-cyan-700 flex items-center gap-2 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            Upload Record
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-gray-200 mb-6">
                        <button
                            onClick={() => setActiveTab('active')}
                            className={`px-6 py-3 border-b-2 font-medium transition-colors ${activeTab === 'active'
                                ? 'border-cyan-600 text-cyan-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            Active Records
                        </button>
                        <button
                            onClick={() => setActiveTab('archived')}
                            className={`px-6 py-3 border-b-2 font-medium transition-colors ${activeTab === 'archived'
                                ? 'border-cyan-600 text-cyan-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            Archived Records
                        </button>
                    </div>

                    {/* Records Section */}
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold text-gray-900">Accessible Records</h3>
                    </div>

                    {records.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-16 text-center">
                            <svg className="w-20 h-20 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <h4 className="text-lg font-semibold text-gray-900 mb-2">No records found</h4>
                            <p className="text-gray-600 mb-6">There are no {activeTab} medical records to display.</p>
                            <button
                                onClick={() => setShowUploadModal(true)}
                                className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 flex items-center gap-2 mx-auto"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                Upload your first record
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {records.map((record: any) => (
                                <div key={record.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 className="text-lg font-semibold text-gray-900">{record.title}</h4>
                                            <p className="text-base text-gray-600 mt-1">{record.description}</p>
                                        </div>
                                        <div className="flex gap-2 ml-4">
                                            <button
                                                onClick={() => window.open(`${backendUrl}/api/ipfs/file/${record.ipfsHash}`, '_blank')}
                                                className="px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-700 flex items-center gap-1 shadow-sm transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                </svg>
                                                Download
                                            </button>
                                            <button
                                                onClick={() => handleEdit(record)}
                                                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleToggleArchive(record.id)}
                                                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                                            >
                                                {activeTab === 'active' ? 'Archive' : 'Unarchive'}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(record.id)}
                                                className="px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>

                                    <hr className="border-gray-100 mb-4" />

                                    <div className="flex flex-wrap gap-6 text-sm text-gray-600">
                                        <div className="flex items-center gap-2" title="Record Type">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <span className="capitalize bg-gray-50 px-2 py-0.5 rounded text-gray-700 border border-gray-200">{record.type?.replace('_', ' ')}</span>
                                        </div>
                                        <div className="flex items-center gap-2" title="Uploaded By">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            <span>{record.providerType === 'patient' ? 'You' : 'Diagnostic Center'}</span>
                                        </div>
                                        <div className="flex items-center gap-2" title="File Name">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                            </svg>
                                            <span className="font-mono text-xs text-gray-500 truncate max-w-[150px]">{record.fileName}</span>
                                        </div>
                                        <div className="flex items-center gap-2" title="Date">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <span>{new Date(record.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-xl">
                        <h3 className="text-2xl font-bold text-gray-900 mb-6">Upload Medical Record</h3>
                        <form onSubmit={handleUpload} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                                <input
                                    type="text"
                                    value={uploadForm.title}
                                    onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                                    required
                                    placeholder="e.g., Blood Test Results - Nov 2024"
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-gray-900"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                                <textarea
                                    value={uploadForm.description}
                                    onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                                    required
                                    placeholder="Brief description of the medical record"
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-gray-900"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                                <select
                                    value={uploadForm.type}
                                    onChange={(e) => setUploadForm({ ...uploadForm, type: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-gray-900"
                                >
                                    <option value="lab_report">Lab Report</option>
                                    <option value="prescription">Prescription</option>
                                    <option value="imaging">Imaging (X-ray, MRI, CT)</option>
                                    <option value="clinical_note">Clinical Note</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">File</label>
                                <input
                                    type="file"
                                    onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                                    required
                                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-gray-900"
                                />
                                <p className="text-xs text-gray-500 mt-1">Supported formats: PDF, JPG, PNG, DOC, DOCX</p>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowUploadModal(false)}
                                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={uploading}
                                    className="flex-1 px-4 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 font-medium"
                                >
                                    {uploading ? "Uploading..." : "Upload"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-xl">
                        <h3 className="text-2xl font-bold text-gray-900 mb-6">Edit Record</h3>
                        <form onSubmit={handleUpdateRecord} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                                <input
                                    type="text"
                                    value={editForm.title}
                                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                    required
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-gray-900"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                                <textarea
                                    value={editForm.description}
                                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                    required
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-gray-900"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowEditModal(false)}
                                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 font-medium"
                                >
                                    Update
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
