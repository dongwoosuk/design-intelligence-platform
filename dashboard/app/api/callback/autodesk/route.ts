import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const APS_CLIENT_ID = process.env.APS_CLIENT_ID;
const APS_CLIENT_SECRET = process.env.APS_CLIENT_SECRET;
const APS_CALLBACK_URL = process.env.APS_CALLBACK_URL || 'http://localhost:4000/api/callback/autodesk';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  // Check for errors
  if (error) {
    console.error('OAuth error:', error);
    return NextResponse.redirect(new URL('/projects?error=auth_failed', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/projects?error=no_code', request.url));
  }

  if (state !== 'acc_integration') {
    return NextResponse.redirect(new URL('/projects?error=invalid_state', request.url));
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${APS_CLIENT_ID}:${APS_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: APS_CALLBACK_URL
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return NextResponse.redirect(new URL('/projects?error=token_exchange_failed', request.url));
    }

    const tokenData = await tokenResponse.json();

    // Store tokens in HTTP-only cookies (secure storage)
    const cookieStore = await cookies();

    // Set access token (expires in ~1 hour)
    cookieStore.set('aps_access_token', tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenData.expires_in || 3600
    });

    // Set refresh token (longer lived)
    if (tokenData.refresh_token) {
      cookieStore.set('aps_refresh_token', tokenData.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 14 // 14 days
      });
    }

    // Redirect to ACC browser page
    return NextResponse.redirect(new URL('/projects/acc?success=true', request.url));
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(new URL('/projects?error=callback_failed', request.url));
  }
}
