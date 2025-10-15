/**
 * ImportEstimate Component
 * Allows users to upload Excel/CSV files and import estimate data
 */

import React, { useState, useRef } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Upload, FileText, CheckCircle, AlertCircle, X, Eye, Download } from 'lucide-react';
import { parseCSVContent, handleExcelFile, ParsedEstimateData } from '../utils/excelParser';
import { importEstimateData, validateImportData } from '../services/importService';
import { Project } from '../types/project';

interface ImportEstimateProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (projectId: string) => void;
  existingProjects?: Project[];
}

export default function ImportEstimate({ 
  isOpen, 
  onClose, 
  onImportSuccess,
  existingProjects = []
}: ImportEstimateProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedEstimateData | null>(null);
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null);
  const [importResult, setImportResult] = useState<{ success: boolean; projectId?: string; tradesImported?: number; errors?: string[]; warnings?: string[] } | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (selectedFile: File) => {
    if (!selectedFile) return;

    // Validate file type
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      alert('Please upload a CSV file. You can export your Excel file as CSV first.');
      return;
    }

    setFile(selectedFile);
    
    try {
      // Parse the CSV content
      const csvContent = await handleExcelFile(selectedFile);
      const parsed = parseCSVContent(csvContent);
      setParsedData(parsed);
      
      // Validate the data
      const validationResult = validateImportData(parsed);
      setValidation(validationResult);
      
      // Set default project name
      setNewProjectName(parsed.projectName || 'Imported Project');
      
      setStep('preview');
    } catch (error) {
      console.error('Parse error:', error);
      alert(`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleImport = async () => {
    if (!parsedData) return;

    setStep('importing');

    try {
      const result = await importEstimateData(
        parsedData,
        (selectedProjectId && selectedProjectId !== '__new__') ? selectedProjectId : undefined
      );
      
      setImportResult(result);
      
      if (result.success) {
        setStep('complete');
        // Auto-close after 2 seconds on success
        setTimeout(() => {
          onImportSuccess(result.projectId!);
          handleClose();
        }, 2000);
      } else {
        setStep('preview'); // Go back to preview to show errors
      }
    } catch (error) {
      console.error('Import error:', error);
      setImportResult({
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown import error']
      });
      setStep('preview');
    }
  };

  const handleClose = () => {
    setStep('upload');
    setFile(null);
    setParsedData(null);
    setValidation(null);
    setImportResult(null);
    setSelectedProjectId('');
    setNewProjectName('');
  };

  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <Upload className="mx-auto h-12 w-12 text-blue-500 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Upload Estimate File</h3>
        <p className="text-gray-600 mb-4">
          Upload your Excel estimate file (exported as CSV)
        </p>
      </div>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={(e) => {
            const selectedFile = e.target.files?.[0];
            if (selectedFile) handleFileSelect(selectedFile);
          }}
          className="hidden"
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          variant="outline"
          className="mb-4"
        >
          <Upload className="h-4 w-4 mr-2" />
          Choose CSV File
        </Button>
        <p className="text-sm text-gray-500">
          Supported format: CSV (export from Excel)
        </p>
      </div>

      {file && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center">
            <FileText className="h-5 w-5 text-blue-500 mr-2" />
            <span className="font-medium">{file.name}</span>
          </div>
        </div>
      )}
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Preview Import Data</h3>
        <Button variant="outline" size="sm" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Project Selection */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="project-select">Import to Project</Label>
          <div className="space-y-2 mt-2">
            <Select value={selectedProjectId || '__new__'} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select existing project or create new..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">Create New Project</SelectItem>
                {existingProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(!selectedProjectId || selectedProjectId === '__new__') && (
          <div>
            <Label htmlFor="new-project-name">New Project Name</Label>
            <Input
              id="new-project-name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Enter project name..."
            />
          </div>
        )}
      </div>

      {/* Data Preview */}
      {parsedData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Eye className="h-5 w-5 mr-2" />
              Import Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Project:</span> {parsedData.projectName}
                </div>
                <div>
                  <span className="font-medium">Items:</span> {parsedData.rows.length}
                </div>
              </div>

              {/* Validation Results */}
              {validation && (
                <div className="space-y-2">
                  {validation.errors.length > 0 && (
                    <div className="bg-red-50 p-3 rounded-lg">
                      <div className="flex items-center mb-2">
                        <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                        <span className="font-medium text-red-700">Errors</span>
                      </div>
                      <ul className="text-sm text-red-600 space-y-1">
                        {validation.errors.map((error, index) => (
                          <li key={index}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validation.warnings.length > 0 && (
                    <div className="bg-yellow-50 p-3 rounded-lg">
                      <div className="flex items-center mb-2">
                        <AlertCircle className="h-4 w-4 text-yellow-500 mr-2" />
                        <span className="font-medium text-yellow-700">Warnings</span>
                      </div>
                      <ul className="text-sm text-yellow-600 space-y-1">
                        {validation.warnings.map((warning, index) => (
                          <li key={index}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Sample Items */}
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="font-medium mb-2">Sample Items (first 5):</h4>
                <div className="space-y-1 text-sm">
                  {parsedData.rows.slice(0, 5).map((row, index) => (
                    <div key={index} className="flex justify-between">
                      <span>{row.category}: {row.name}</span>
                      <span className="font-medium">${row.totalCost.toFixed(2)}</span>
                    </div>
                  ))}
                  {parsedData.rows.length > 5 && (
                    <div className="text-gray-500 italic">
                      ... and {parsedData.rows.length - 5} more items
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Errors */}
      {importResult && !importResult.success && (
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="flex items-center mb-2">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
            <span className="font-medium text-red-700">Import Failed</span>
          </div>
          <ul className="text-sm text-red-600 space-y-1">
            {importResult.errors?.map((error, index) => (
              <li key={index}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3">
        <Button variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          disabled={!validation?.valid || !parsedData}
          className="bg-green-600 hover:bg-green-700"
        >
          Import {parsedData?.rows.length || 0} Items
        </Button>
      </div>
    </div>
  );

  const renderImportingStep = () => (
    <div className="text-center space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
      <h3 className="text-lg font-semibold">Importing Estimate Data...</h3>
      <p className="text-gray-600">
        Please wait while we import your estimate items.
      </p>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="text-center space-y-4">
      <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
      <h3 className="text-lg font-semibold text-green-700">Import Successful!</h3>
      <p className="text-gray-600">
        Successfully imported {importResult?.tradesImported} estimate items.
      </p>
      <p className="text-sm text-gray-500">
        Redirecting to project...
      </p>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Estimate from Excel/CSV</DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {step === 'upload' && renderUploadStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'importing' && renderImportingStep()}
          {step === 'complete' && renderCompleteStep()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
