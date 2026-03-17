import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// List all ACC hubs (accounts) the user has access to
export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('aps_access_token');

  if (!accessToken?.value) {
    return NextResponse.json(
      { error: 'Not authenticated', needsReauth: true },
      { status: 401 }
    );
  }

  try {
    const response = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
      headers: {
        'Authorization': `Bearer ${accessToken.value}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 401) {
      return NextResponse.json(
        { error: 'Token expired', needsReauth: true },
        { status: 401 }
      );
    }

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Failed to fetch hubs:', errorData);
      return NextResponse.json(
        { error: 'Failed to fetch hubs' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Debug: Log raw response
    console.log('Hubs API raw response:', JSON.stringify(data, null, 2));

    // Format hub data for frontend
    const hubs = data.data?.map((hub: any) => ({
      id: hub.id,
      name: hub.attributes?.name || 'Unknown Hub',
      type: hub.attributes?.extension?.type || 'unknown',
      region: hub.attributes?.region || 'US'
    })) || [];

    return NextResponse.json({ hubs, debug: { rawData: data, hubCount: data.data?.length || 0 } });
  } catch (err) {
    console.error('Hubs fetch error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch hubs' },
      { status: 500 }
    );
  }
}
