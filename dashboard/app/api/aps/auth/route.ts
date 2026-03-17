import { NextResponse } from 'next/server';

const APS_CLIENT_ID = process.env.APS_CLIENT_ID;
const APS_CALLBACK_URL = process.env.APS_CALLBACK_URL || 'http://localhost:4000/api/callback/autodesk';

// APS OAuth2 scopes for ACC access
const SCOPES = [
  'data:read',           // Read data from ACC
  'data:write',          // Write data to ACC (optional)
  'account:read',        // Read account information
  'bucket:read',         // Read bucket data
  'viewables:read',      // Read viewable data
].join(' ');

export async function GET() {
  if (!APS_CLIENT_ID) {
    return NextResponse.json(
      { error: 'APS_CLIENT_ID not configured' },
      { status: 500 }
    );
  }

  // Build OAuth2 authorization URL
  const authUrl = new URL('https://developer.api.autodesk.com/authentication/v2/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', APS_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', APS_CALLBACK_URL);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', 'acc_integration'); // For security

  return NextResponse.json({
    authUrl: authUrl.toString(),
    message: 'Redirect user to authUrl for Autodesk login'
  });
}
