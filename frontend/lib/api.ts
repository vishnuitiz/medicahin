import axios from 'axios';
import { getSession } from 'next-auth/react';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add session token to requests for backend authentication
api.interceptors.request.use(async (config) => {
    try {
        const session = await getSession();

        console.log('[API Client] Session status:', session ? 'Found' : 'Not found');

        if (session?.user?.email) {
            // For now, we'll use a simple approach: pass user info in headers
            // In production, you'd want to implement proper JWT tokens
            config.headers['x-user-email'] = session.user.email;
            config.headers['x-user-role'] = session.user.role || 'patient';

            if (session.user.patientId) {
                config.headers['x-patient-id'] = session.user.patientId;
            }
            if (session.user.providerId) {
                config.headers['x-provider-id'] = session.user.providerId;
            }

            console.log('[API Client] Added headers:', {
                email: session.user.email,
                role: session.user.role,
                patientId: session.user.patientId
            });
        } else {
            console.warn('[API Client] No session or user email found');
        }
    } catch (error) {
        console.error('[API Client] Failed to get session:', error);
    }

    return config;
}, (error) => {
    return Promise.reject(error);
});

// Enhanced error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response) {
            // Log detailed error for debugging
            console.error('API Error:', {
                status: error.response.status,
                url: error.config?.url,
                method: error.config?.method,
                data: error.response.data
            });
        } else if (error.request) {
            console.error('Network Error:', error.message);
        }
        return Promise.reject(error);
    }
);

export default api;
