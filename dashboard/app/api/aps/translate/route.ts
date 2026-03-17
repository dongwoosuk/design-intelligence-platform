import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Start model translation (needed before metadata extraction)
export async function POST(request: NextRequest) {
  const { versionUrn } = await request.json();

  if (!versionUrn) {
    return NextResponse.json(
      { error: 'versionUrn is required' },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get('aps_access_token');

  if (!accessToken?.value) {
    return NextResponse.json(
      { error: 'Not authenticated', needsReauth: true },
      { status: 401 }
    );
  }

  try {
    // Base64 encode the version URN for Model Derivative API
    const base64Urn = Buffer.from(versionUrn).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Start translation job
    const response = await fetch(
      'https://developer.api.autodesk.com/modelderivative/v2/designdata/job',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken.value}`,
          'Content-Type': 'application/json',
          'x-ads-force': 'false' // Don't re-translate if already done
        },
        body: JSON.stringify({
          input: {
            urn: base64Urn
          },
          output: {
            destination: {
              region: 'us'
            },
            formats: [
              {
                type: 'svf2', // New viewing format
                views: ['2d', '3d']
              }
            ]
          }
        })
      }
    );

    if (response.status === 401) {
      return NextResponse.json(
        { error: 'Token expired', needsReauth: true },
        { status: 401 }
      );
    }

    // 200 = already translated, 201 = translation started
    if (response.status === 200 || response.status === 201) {
      const data = await response.json();
      return NextResponse.json({
        success: true,
        status: response.status === 200 ? 'already_translated' : 'translation_started',
        urn: base64Urn,
        result: data
      });
    }

    const errorData = await response.text();
    console.error('Translation failed:', errorData);
    return NextResponse.json(
      { error: 'Failed to start translation', details: errorData },
      { status: response.status }
    );
  } catch (err) {
    console.error('Translation error:', err);
    return NextResponse.json(
      { error: 'Failed to start translation' },
      { status: 500 }
    );
  }
}
