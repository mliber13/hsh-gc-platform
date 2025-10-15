/**
 * Data Migration Tool
 * Upload and migrate localStorage data to Supabase
 */

import React, { useState } from 'react';
import { Upload, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { migrateData } from '../scripts/migrateToSupabase';

export function DataMigration() {
  const [file, setFile] = useState<File | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleMigrate = async () => {
    if (!file) return;

    setMigrating(true);
    setResult(null);

    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);

      console.log('Starting migration with data:', {
        projects: jsonData.projects?.length || 0,
        estimates: jsonData.estimates?.length || 0,
        trades: jsonData.trades?.length || 0,
      });

      await migrateData(jsonData);

      setResult({
        success: true,
        message: 'Migration completed successfully! Refresh the page to see your data.',
      });
    } catch (error: any) {
      console.error('Migration error:', error);
      setResult({
        success: false,
        message: `Migration failed: ${error.message}`,
      });
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Data Migration Tool</h1>
        <p className="text-gray-600 mb-6">
          Upload your exported JSON file to migrate your data from localStorage to Supabase
        </p>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 mb-6">
          <div className="text-center">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <label htmlFor="file-upload" className="cursor-pointer">
              <span className="text-blue-600 hover:text-blue-700 font-medium">
                Choose a file
              </span>
              <input
                id="file-upload"
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            <p className="text-sm text-gray-500 mt-2">or drag and drop your JSON file here</p>
          </div>

          {file && (
            <div className="mt-4 p-3 bg-blue-50 rounded-md">
              <p className="text-sm text-blue-900">
                <strong>Selected file:</strong> {file.name}
              </p>
              <p className="text-xs text-blue-700 mt-1">
                Size: {(file.size / 1024).toFixed(2)} KB
              </p>
            </div>
          )}
        </div>

        <Button
          onClick={handleMigrate}
          disabled={!file || migrating}
          className="w-full"
          size="lg"
        >
          {migrating ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Migrating Data...
            </>
          ) : (
            <>
              <Upload className="w-5 h-5 mr-2" />
              Start Migration
            </>
          )}
        </Button>

        {result && (
          <div
            className={`mt-6 p-4 rounded-md ${
              result.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="flex items-start">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-600 mr-3 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 mr-3 mt-0.5" />
              )}
              <div>
                <h3
                  className={`font-semibold ${
                    result.success ? 'text-green-900' : 'text-red-900'
                  }`}
                >
                  {result.success ? 'Success!' : 'Error'}
                </h3>
                <p
                  className={`text-sm mt-1 ${
                    result.success ? 'text-green-800' : 'text-red-800'
                  }`}
                >
                  {result.message}
                </p>
                {result.success && (
                  <Button
                    onClick={() => window.location.href = '/'}
                    className="mt-3"
                    size="sm"
                  >
                    Go to Dashboard
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <h4 className="text-sm font-semibold text-yellow-900 mb-2">⚠️ Important Notes:</h4>
          <ul className="text-sm text-yellow-800 space-y-1">
            <li>• Make sure you're logged in before migrating</li>
            <li>• The migration will add data to your current organization</li>
            <li>• Check the browser console for detailed migration logs</li>
            <li>• This process may take a few minutes for large datasets</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

