'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

interface Hub {
  id: string;
  name: string;
  type: string;
  region: string;
}

interface Project {
  id: string;
  name: string;
  scopes: string[];
  rootFolderId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface FolderItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  extension?: string;
  isRevit?: boolean;
  version?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface BreadcrumbItem {
  id: string;
  name: string;
  type: 'hub' | 'project' | 'folder';
}

interface ExtractedData {
  project_name: string;
  project_number: string;
  project_address: string;
  client_name: string;
  building_type: string;
  rawProjectInfo: Record<string, string>;
}

export default function ACCBrowserPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation state
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);

  // Selection state
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Extraction state
  const [extracting, setExtracting] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);

  // Check authentication status
  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/aps/token');
      const data = await response.json();
      setIsAuthenticated(data.authenticated);

      if (data.authenticated) {
        // Load hubs
        await loadHubs();
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check for success/error params
    const success = searchParams.get('success');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(`Authentication failed: ${errorParam}`);
    }

    checkAuth();
  }, [searchParams, checkAuth]);

  // Load hubs
  const loadHubs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/aps/hubs');
      if (response.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setHubs(data.hubs || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load hubs');
    } finally {
      setIsLoading(false);
    }
  };

  // Load projects for a hub
  const loadProjects = async (hub: Hub) => {
    setIsLoading(true);
    setError(null);
    setSelectedHub(hub);
    setSelectedProject(null);
    setCurrentFolderId(null);
    setFolders([]);
    setItems([]);
    setBreadcrumb([{ id: hub.id, name: hub.name, type: 'hub' }]);

    try {
      const response = await fetch(`/api/aps/projects?hubId=${hub.id}`);
      if (response.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setProjects(data.projects || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  // Load folder contents
  const loadFolderContents = async (project: Project, folderId: string, folderName?: string) => {
    setIsLoading(true);
    setError(null);

    if (project !== selectedProject) {
      setSelectedProject(project);
      setCurrentFolderId(folderId);
      setBreadcrumb([
        { id: selectedHub!.id, name: selectedHub!.name, type: 'hub' },
        { id: project.id, name: project.name, type: 'project' }
      ]);
    } else if (folderName) {
      // Navigating into a subfolder
      setCurrentFolderId(folderId);
      setBreadcrumb(prev => [...prev, { id: folderId, name: folderName, type: 'folder' }]);
    }

    try {
      const response = await fetch(`/api/aps/files?projectId=${project.id}&folderId=${folderId}`);
      if (response.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setFolders(data.folders || []);
      setItems(data.items || []);
      setProjects([]); // Clear projects list when viewing folder
    } catch (err: any) {
      setError(err.message || 'Failed to load folder contents');
    } finally {
      setIsLoading(false);
    }
  };

  // Navigate via breadcrumb
  const navigateToBreadcrumb = (index: number) => {
    const target = breadcrumb[index];
    if (target.type === 'hub') {
      setSelectedProject(null);
      setCurrentFolderId(null);
      setFolders([]);
      setItems([]);
      setBreadcrumb([target]);
      loadProjects(selectedHub!);
    } else if (target.type === 'project') {
      const project = { id: target.id, name: target.name } as Project;
      loadFolderContents(project, project.id, undefined);
    }
  };

  // Start Autodesk login
  const handleLogin = async () => {
    try {
      const response = await fetch('/api/aps/auth');
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      setError('Failed to initiate login');
    }
  };

  // Logout
  const handleLogout = async () => {
    await fetch('/api/aps/token', { method: 'DELETE' });
    setIsAuthenticated(false);
    setHubs([]);
    setProjects([]);
    setFolders([]);
    setItems([]);
    setSelectedHub(null);
    setSelectedProject(null);
    setBreadcrumb([]);
  };

  // Extract data from Revit file
  const handleExtractData = async (item: FolderItem) => {
    if (!item.version) {
      setError('No version URN available for this file');
      return;
    }

    setExtracting(item.id);
    setExtractedData(null);
    setError(null);

    try {
      // First, start translation if needed
      const translateResponse = await fetch('/api/aps/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionUrn: item.version })
      });
      const translateData = await translateResponse.json();

      if (translateData.error) {
        throw new Error(translateData.error);
      }

      const urn = translateData.urn;

      // Check metadata status
      let retries = 0;
      const maxRetries = 10;

      const checkMetadata = async (): Promise<any> => {
        const metaResponse = await fetch(`/api/aps/metadata?urn=${urn}`);
        const metaData = await metaResponse.json();

        if (metaData.status === 'success') {
          return metaData;
        } else if (metaData.status === 'inprogress' || metaData.status === 'pending') {
          if (retries < maxRetries) {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 3000));
            return checkMetadata();
          }
          throw new Error('Translation taking too long. Please try again later.');
        } else if (metaData.status === 'not_translated') {
          throw new Error('Model needs to be translated first');
        } else {
          throw new Error(`Unexpected status: ${metaData.status}`);
        }
      };

      const metaData = await checkMetadata();

      // Get the first 3D view for property extraction
      const views = metaData.views || [];
      const view3d = views.find((v: any) => v.role === '3d') || views[0];

      if (!view3d) {
        throw new Error('No views found in the model');
      }

      // Extract project info
      const extractResponse = await fetch('/api/aps/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urn, guid: view3d.guid })
      });

      const extractData = await extractResponse.json();

      if (extractData.error) {
        throw new Error(extractData.error);
      }

      setExtractedData(extractData.extractedData);
    } catch (err: any) {
      setError(err.message || 'Failed to extract data');
    } finally {
      setExtracting(null);
    }
  };

  // Import extracted data to Project DB
  const handleImport = () => {
    if (!extractedData) return;

    // Navigate to new project form with pre-filled data
    const params = new URLSearchParams();
    if (extractedData.project_name) params.set('name', extractedData.project_name);
    if (extractedData.project_number) params.set('number', extractedData.project_number);
    if (extractedData.project_address) params.set('address', extractedData.project_address);
    if (extractedData.client_name) params.set('client', extractedData.client_name);
    if (extractedData.building_type) params.set('type', extractedData.building_type);

    router.push(`/projects/new?${params.toString()}`);
  };

  if (isLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/projects" className="text-gray-400 hover:text-white mb-2 inline-block">
            &larr; Back to Project DB
          </Link>
          <h1 className="text-3xl font-bold">ACC Browser</h1>
          <p className="text-gray-400 mt-1">
            Browse Autodesk Construction Cloud and import project data
          </p>
        </div>
        {isAuthenticated && (
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
          >
            Disconnect ACC
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-6">
          {error}
          <button onClick={() => setError(null)} className="float-right">&times;</button>
        </div>
      )}

      {/* Not authenticated - Show login */}
      {!isAuthenticated && (
        <div className="bg-gray-800 rounded-lg p-8 text-center max-w-md mx-auto">
          <div className="text-6xl mb-4">🔐</div>
          <h2 className="text-xl font-bold mb-4">Connect to ACC</h2>
          <p className="text-gray-400 mb-6">
            Sign in with your Autodesk account to browse ACC projects and extract project data from Revit models.
          </p>
          <button
            onClick={handleLogin}
            className="w-full px-6 py-3 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-500 transition"
          >
            Sign in with Autodesk
          </button>
        </div>
      )}

      {/* Authenticated - Show browser */}
      {isAuthenticated && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Browser */}
          <div className="lg:col-span-2">
            {/* Breadcrumb */}
            {breadcrumb.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
                <button
                  onClick={() => {
                    setSelectedHub(null);
                    setSelectedProject(null);
                    setCurrentFolderId(null);
                    setFolders([]);
                    setItems([]);
                    setProjects([]);
                    setBreadcrumb([]);
                    loadHubs();
                  }}
                  className="hover:text-white"
                >
                  🏠 Hubs
                </button>
                {breadcrumb.map((item, index) => (
                  <span key={item.id} className="flex items-center gap-2">
                    <span>/</span>
                    <button
                      onClick={() => navigateToBreadcrumb(index)}
                      className={index === breadcrumb.length - 1 ? 'text-white' : 'hover:text-white'}
                    >
                      {item.name}
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Loading */}
            {isLoading && (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            )}

            {/* Hubs list */}
            {!isLoading && !selectedHub && hubs.length > 0 && (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-700/50 font-semibold">
                  Select a Hub (ACC Account)
                </div>
                <div className="divide-y divide-gray-700">
                  {hubs.map(hub => (
                    <button
                      key={hub.id}
                      onClick={() => loadProjects(hub)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-700/50 transition text-left"
                    >
                      <span className="text-2xl">🏢</span>
                      <div>
                        <div className="font-medium">{hub.name}</div>
                        <div className="text-sm text-gray-400">{hub.type} · {hub.region}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Projects list */}
            {!isLoading && projects.length > 0 && (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-700/50 font-semibold">
                  Projects ({projects.length})
                </div>
                <div className="divide-y divide-gray-700 max-h-[60vh] overflow-y-auto">
                  {projects.map(project => (
                    <button
                      key={project.id}
                      onClick={() => {
                        if (project.rootFolderId) {
                          loadFolderContents(project, project.rootFolderId);
                        }
                      }}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-700/50 transition text-left"
                    >
                      <span className="text-2xl">📁</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{project.name}</div>
                        {project.updatedAt && (
                          <div className="text-sm text-gray-400">
                            Updated: {new Date(project.updatedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Folder contents */}
            {!isLoading && selectedProject && (folders.length > 0 || items.length > 0) && (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-700/50 font-semibold">
                  Contents ({folders.length} folders, {items.length} files)
                </div>
                <div className="divide-y divide-gray-700 max-h-[60vh] overflow-y-auto">
                  {/* Folders */}
                  {folders.map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => loadFolderContents(selectedProject, folder.id, folder.name)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-700/50 transition text-left"
                    >
                      <span className="text-2xl">📂</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{folder.name}</div>
                      </div>
                    </button>
                  ))}

                  {/* Files */}
                  {items.map(item => (
                    <div
                      key={item.id}
                      className="px-4 py-3 flex items-center gap-3"
                    >
                      <span className="text-2xl">
                        {item.isRevit ? '🏗️' : '📄'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{item.name}</div>
                        <div className="text-sm text-gray-400">
                          {item.extension?.toUpperCase() || 'File'}
                        </div>
                      </div>
                      {item.isRevit && (
                        <button
                          onClick={() => handleExtractData(item)}
                          disabled={extracting === item.id}
                          className="px-3 py-1.5 bg-blue-600 text-sm rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-wait"
                        >
                          {extracting === item.id ? 'Extracting...' : 'Extract'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!isLoading && !selectedHub && hubs.length === 0 && (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <p className="text-gray-400">No ACC hubs found. Make sure your Autodesk account has access to ACC.</p>
                <button
                  onClick={loadHubs}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Right: Extracted Data */}
          <div>
            <div className="bg-gray-800 rounded-lg p-4 sticky top-4">
              <h3 className="font-semibold mb-4">Extracted Data</h3>

              {!extractedData && !extracting && (
                <p className="text-gray-400 text-sm">
                  Select a Revit file (.rvt) and click &quot;Extract&quot; to pull project information.
                </p>
              )}

              {extracting && (
                <div className="flex items-center gap-3 text-gray-400">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                  <span>Extracting data...</span>
                </div>
              )}

              {extractedData && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-400">Project Name</label>
                    <div className="font-medium">{extractedData.project_name || '-'}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Project Number</label>
                    <div className="font-medium">{extractedData.project_number || '-'}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Address</label>
                    <div className="font-medium">{extractedData.project_address || '-'}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Client</label>
                    <div className="font-medium">{extractedData.client_name || '-'}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Building Type</label>
                    <div className="font-medium">{extractedData.building_type || '-'}</div>
                  </div>

                  {/* Raw data toggle */}
                  {Object.keys(extractedData.rawProjectInfo || {}).length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-blue-400 hover:text-blue-300">
                        View all extracted properties
                      </summary>
                      <pre className="mt-2 bg-gray-900 rounded p-2 text-xs overflow-x-auto max-h-48">
                        {JSON.stringify(extractedData.rawProjectInfo, null, 2)}
                      </pre>
                    </details>
                  )}

                  <button
                    onClick={handleImport}
                    className="w-full mt-4 px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-500"
                  >
                    Import to Project DB
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
