import type { Handle, HandleServerError } from '@sveltejs/kit';

// Global request handler for logging
export const handle: Handle = async ({ event, resolve }) => {
  console.log('🌐 Request:', {
    method: event.request.method,
    url: event.url.pathname,
    params: event.url.searchParams.toString(),
    timestamp: new Date().toISOString()
  });

  try {
    const response = await resolve(event);
    
    console.log('✅ Response:', {
      url: event.url.pathname,
      status: response.status,
      timestamp: new Date().toISOString()
    });
    
    return response;
  } catch (error) {
    console.error('💥 Unhandled error in handle:', {
      url: event.url.pathname,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
};

// Global error handler
export const handleError: HandleServerError = ({ error, event }) => {
  console.error('💥 Server error:', {
    url: event.url.pathname,
    method: event.request.method,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });

  return {
    message: 'Internal server error occurred',
    code: 'INTERNAL_SERVER_ERROR'
  };
};