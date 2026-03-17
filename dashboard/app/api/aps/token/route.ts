import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const APS_CLIENT_ID = process.env.APS_CLIENT_ID;
const APS_CLIENT_SECRET = process.env.APS_CLIENT_SECRET;

// Get current token status
export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('aps_access_token');

  return NextResponse.json({
    authenticated: !!accessToken,
    hasToken: !!accessToken?.value
  });
}

// Refresh token
export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('aps_refresh_token');

  if (!refreshToken?.value) {
    return NextResponse.json(
      { error: 'No refresh token available', needsReauth: true },
      { status: 401 }
    );
  }

  try {
    const tokenResponse = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${APS_CLIENT_ID}:${APS_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken.value
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token refresh failed:', errorData);

      // Clear invalid tokens
      cookieStore.delete('aps_access_token');
      cookieStore.delete('aps_refresh_token');

      return NextResponse.json(
        { error: 'Token refresh failed', needsReauth: true },
        { status: 401 }
      );
    }

    const tokenData = await tokenResponse.json();

    // Update tokens
    cookieStore.set('aps_access_token', tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenData.expires_in || 3600
    });

    if (tokenData.refresh_token) {
      cookieStore.set('aps_refresh_token', tokenData.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 14
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Token refresh error:', err);
    return NextResponse.json(
      { error: 'Token refresh failed' },
      { status: 500 }
    );
  }
}

// Logout - clear tokens
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('aps_access_token');
  cookieStore.delete('aps_refresh_token');

  return NextResponse.json({ success: true });
}
