/**
 * MigratePlans Component
 * UI for migrating plans from localStorage to Supabase
 */

import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { AlertCircle, CheckCircle, Database, Upload } from 'lucide-react';
import { migratePlansToSupabase, checkPlansInSupabase } from '../scripts/migratePlansToSupabase';

interface MigratePlansProps {
  onComplete?: () => void;
}

export default function MigratePlans({ onComplete }: MigratePlansProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; plansMigrated: number; errors: string[] } | null>(null);
  const [supabaseCount, setSupabaseCount] = useState<number | null>(null);

  const handleMigrate = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const migrationResult = await migratePlansToSupabase();
      setResult(migrationResult);
      
      // Update Supabase count
      const count = await checkPlansInSupabase();
      setSupabaseCount(count);

      if (migrationResult.success && onComplete) {
        setTimeout(() => onComplete(), 2000);
      }
    } catch (error) {
      setResult({
        success: false,
        plansMigrated: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    } finally {
      setIsLoading(false);
    }
  };

  const checkSupabaseCount = async () => {
    const count = await checkPlansInSupabase();
    setSupabaseCount(count);
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Migrate Plans to Supabase
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <p className="text-sm text-blue-800">
            This will migrate all plans from localStorage to Supabase. 
            Your plans will be available in both locations after migration.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Plans in Supabase:</p>
            <p className="text-2xl font-bold text-blue-600">
              {supabaseCount !== null ? supabaseCount : 'Unknown'}
            </p>
          </div>
          <Button 
            onClick={checkSupabaseCount} 
            variant="outline"
            disabled={isLoading}
          >
            Check Count
          </Button>
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={handleMigrate} 
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Migrating...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Migrate Plans
              </>
            )}
          </Button>
        </div>

        {result && (
          <div className={`p-4 rounded-lg ${
            result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              <span className={`font-medium ${
                result.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {result.success ? 'Migration Successful!' : 'Migration Failed'}
              </span>
            </div>
            
            <p className={`text-sm ${
              result.success ? 'text-green-700' : 'text-red-700'
            }`}>
              {result.success 
                ? `Successfully migrated ${result.plansMigrated} plans to Supabase.`
                : `Failed to migrate plans. ${result.plansMigrated} plans were migrated before errors occurred.`
              }
            </p>

            {result.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-medium text-red-800 mb-1">Errors:</p>
                <ul className="text-sm text-red-700 space-y-1">
                  {result.errors.map((error, index) => (
                    <li key={index} className="flex items-start gap-1">
                      <span className="text-red-500">•</span>
                      <span>{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
