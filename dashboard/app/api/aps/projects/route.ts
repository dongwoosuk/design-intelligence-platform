import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// List all projects in a hub
export async function GET(request: NextRequest) {
  const hubId = request.nextUrl.searchParams.get('hubId');

  if (!hubId) {
    return NextResponse.json(
      { error: 'hubId is required' },
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
    const response = await fetch(
      `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken.value}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 401) {
      return NextResponse.json(
        { error: 'Token expired', needsReauth: true },
        { status: 401 }
      );
    }

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Failed to fetch projects:', errorData);
      return NextResponse.json(
        { error: 'Failed to fetch projects' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Format project data for frontend
    const projects = data.data?.map((project: any) => ({
      id: project.id,
      name: project.attributes?.name || 'Unknown Project',
      scopes: project.attributes?.scopes || [],
      rootFolderId: project.relationships?.rootFolder?.data?.id,
      createdAt: project.attributes?.createdTime,
      updatedAt: project.attributes?.lastModifiedTime
    })) || [];

    return NextResponse.json({ projects });
  } catch (err) {
    console.error('Projects fetch error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}
