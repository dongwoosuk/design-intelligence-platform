import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Get metadata from a Revit model (using Model Derivative API)
export async function GET(request: NextRequest) {
  const urn = request.nextUrl.searchParams.get('urn'); // Base64 encoded version URN
  const guid = request.nextUrl.searchParams.get('guid'); // Model GUID (optional)

  if (!urn) {
    return NextResponse.json(
      { error: 'urn is required (base64 encoded version URN)' },
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
    // First, get the model manifest to check translation status
    const manifestResponse = await fetch(
      `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/manifest`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken.value}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (manifestResponse.status === 401) {
      return NextResponse.json(
        { error: 'Token expired', needsReauth: true },
        { status: 401 }
      );
    }

    if (manifestResponse.status === 404) {
      // Model hasn't been translated yet - trigger translation
      return NextResponse.json({
        status: 'not_translated',
        message: 'Model needs to be translated first. Use POST /api/aps/translate to start.'
      });
    }

    if (!manifestResponse.ok) {
      const errorData = await manifestResponse.text();
      console.error('Failed to get manifest:', errorData);
      return NextResponse.json(
        { error: 'Failed to get model manifest' },
        { status: manifestResponse.status }
      );
    }

    const manifest = await manifestResponse.json();

    // Check translation status
    if (manifest.status !== 'success') {
      return NextResponse.json({
        status: manifest.status,
        progress: manifest.progress,
        message: `Translation ${manifest.status}: ${manifest.progress || 'in progress'}`
      });
    }

    // Get metadata (lists available views/model GUIDs)
    const metadataResponse = await fetch(
      `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/metadata`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken.value}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!metadataResponse.ok) {
      const errorData = await metadataResponse.text();
      console.error('Failed to get metadata:', errorData);
      return NextResponse.json(
        { error: 'Failed to get metadata' },
        { status: metadataResponse.status }
      );
    }

    const metadata = await metadataResponse.json();

    // If guid is provided, get properties for that specific view
    if (guid) {
      const propertiesResponse = await fetch(
        `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/metadata/${guid}/properties`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken.value}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!propertiesResponse.ok) {
        const errorData = await propertiesResponse.text();
        console.error('Failed to get properties:', errorData);
        return NextResponse.json(
          { error: 'Failed to get properties' },
          { status: propertiesResponse.status }
        );
      }

      const properties = await propertiesResponse.json();

      return NextResponse.json({
        status: 'success',
        manifest,
        metadata,
        properties
      });
    }

    return NextResponse.json({
      status: 'success',
      manifest,
      metadata,
      views: metadata.data?.metadata || []
    });
  } catch (err) {
    console.error('Metadata fetch error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch metadata' },
      { status: 500 }
    );
  }
}

// Extract Project Info from Revit model properties
export async function POST(request: NextRequest) {
  const { urn, guid } = await request.json();

  if (!urn || !guid) {
    return NextResponse.json(
      { error: 'urn and guid are required' },
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
    // Get all properties for the model
    const propertiesResponse = await fetch(
      `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/metadata/${guid}/properties`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken.value}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!propertiesResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to get properties' },
        { status: propertiesResponse.status }
      );
    }

    const propertiesData = await propertiesResponse.json();
    const collection = propertiesData.data?.collection || [];

    // Extract Project Information from Revit model
    // Look for Project Information category
    const projectInfo: Record<string, string> = {};

    for (const item of collection) {
      if (item.name === 'Project Information' ||
          item.properties?.Category === 'Project Information') {
        // Extract project properties
        const props = item.properties || {};
        for (const [key, value] of Object.entries(props)) {
          if (typeof value === 'string' || typeof value === 'number') {
            projectInfo[key] = String(value);
          }
        }
      }
    }

    // Map to our ArchivedProject schema
    const mappedProject = {
      project_name: projectInfo['Project Name'] || projectInfo['Name'] || '',
      project_number: projectInfo['Project Number'] || projectInfo['Number'] || '',
      project_address: projectInfo['Project Address'] || projectInfo['Address'] || '',
      client_name: projectInfo['Client Name'] || projectInfo['Owner'] || '',
      building_type: projectInfo['Building Type'] || '',
      // Additional fields from Revit
      rawProjectInfo: projectInfo
    };

    return NextResponse.json({
      success: true,
      extractedData: mappedProject
    });
  } catch (err) {
    console.error('Project info extraction error:', err);
    return NextResponse.json(
      { error: 'Failed to extract project info' },
      { status: 500 }
    );
  }
}
