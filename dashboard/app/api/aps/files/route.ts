import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// List folder contents (files and subfolders)
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  const folderId = request.nextUrl.searchParams.get('folderId');

  if (!projectId || !folderId) {
    return NextResponse.json(
      { error: 'projectId and folderId are required' },
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
      `https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${folderId}/contents`,
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
      console.error('Failed to fetch folder contents:', errorData);
      return NextResponse.json(
        { error: 'Failed to fetch folder contents' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Separate folders and items
    const folders: any[] = [];
    const items: any[] = [];

    data.data?.forEach((item: any) => {
      if (item.type === 'folders') {
        folders.push({
          id: item.id,
          name: item.attributes?.name || 'Unknown Folder',
          type: 'folder',
          createdAt: item.attributes?.createTime,
          updatedAt: item.attributes?.lastModifiedTime
        });
      } else if (item.type === 'items') {
        const displayName = item.attributes?.displayName || item.attributes?.name || 'Unknown File';
        const extension = displayName.split('.').pop()?.toLowerCase() || '';

        items.push({
          id: item.id,
          name: displayName,
          type: 'file',
          extension: extension,
          isRevit: ['rvt', 'rfa', 'rte', 'rft'].includes(extension),
          version: item.relationships?.tip?.data?.id,
          createdAt: item.attributes?.createTime,
          updatedAt: item.attributes?.lastModifiedTime
        });
      }
    });

    return NextResponse.json({ folders, items });
  } catch (err) {
    console.error('Folder contents fetch error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch folder contents' },
      { status: 500 }
    );
  }
}
