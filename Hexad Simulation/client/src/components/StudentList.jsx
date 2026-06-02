import React, { useState, useEffect } from 'react';
import { Card } from './common/Card';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { SkeletonRow } from './common/Loader';
import { useStudents } from '../hooks/useStudents';

export const StudentList = ({ refreshTrigger }) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [mappingText, setMappingText] = useState('');
  const [mappingResult, setMappingResult] = useState(null);
  const { students, loading, fetchStudents, deleteStudent, deleteAllStudents, mapHexadIds } = useStudents();
  const itemsPerPage = 10;
  const mappedCount = students.filter((s) => !!s.hexadStudentId).length;

  const query = search.trim().toLowerCase();
  const filteredStudents = students.filter((s) => {
    if (!query) return true;

    const studentId = String(s.studentId || '').toLowerCase();
    const email = String(s.email || '').toLowerCase();
    const name = String(s.name || '').toLowerCase();
    const firstName = String(s.firstName || '').toLowerCase();
    const lastName = String(s.lastName || '').toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim();

    return (
      studentId.includes(query) ||
      email.includes(query) ||
      name.includes(query) ||
      firstName.includes(query) ||
      lastName.includes(query) ||
      fullName.includes(query)
    );
  });
  const paginatedStudents = filteredStudents.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents, refreshTrigger]);

  const handleDelete = async (studentId) => {
    if (window.confirm(`Delete ${studentId}?`)) {
      try {
        await deleteStudent(studentId);
      } catch (err) {
        console.error('Delete error:', err);
      }
    }
  };

  const handleDeleteAll = async () => {
    if (window.confirm('Delete ALL students? This cannot be undone.')) {
      try {
        await deleteAllStudents();
        setPage(0);
      } catch (err) {
        console.error('Delete all error:', err);
      }
    }
  };

  const handleMapIds = async () => {
    if (!mappingText.trim()) {
      alert('Paste at least one mapping line first.');
      return;
    }

    try {
      const result = await mapHexadIds(mappingText);
      setMappingResult(result);
    } catch (err) {
      console.error('ID mapping error:', err);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-semibold gradient-text">👥 Student List</h2>
        <span className="text-sm text-slate-400">
          {query ? `${filteredStudents.length} results • ${students.length} total` : `${students.length} students`} • {mappedCount} mapped
        </span>
      </div>

      <div className="p-3 rounded-lg border border-slate-600 bg-slate-800 bg-opacity-50 space-y-2">
        <p className="text-sm text-slate-200 font-medium">Import enrolled IDs (one-time sync)</p>
        <p className="text-xs text-slate-400">
          Paste lines as <span className="font-mono">hexadStudentId,email</span> (preferred) or <span className="font-mono">STD-001,hexadStudentId</span>.
        </p>
        <textarea
          className="input-base w-full min-h-[88px] font-mono text-xs"
          placeholder="4hin0RMaETZIbQDqvo7pXSw1qRF2,rebecca.delgado@hexad.test"
          value={mappingText}
          onChange={(e) => setMappingText(e.target.value)}
        />
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleMapIds} disabled={loading || !mappingText.trim()}>
            Import IDs
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setMappingText('')} disabled={loading}>
            Clear
          </Button>
        </div>
        {mappingResult && (
          <p className="text-xs text-slate-400">
            Imported: received {mappingResult.received}, matched {mappingResult.matched}, updated {mappingResult.modified}. Mapped total: {mappingResult.mappedStudents}/{mappingResult.totalStudents}.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search by ID, first/last name, or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="flex-1"
        />
        {students.length > 0 && (
          <Button variant="danger" size="md" onClick={handleDeleteAll}>
            Clear All
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : paginatedStudents.length > 0 ? (
        <>
          <div className="overflow-x-auto border border-slate-600 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600 bg-slate-700 bg-opacity-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-300">Student ID</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-300">Hexad ID</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-300">First Name</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-300">Last Name</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-300">Email</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-300">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedStudents.map((student) => {
                  const derivedParts = String(student.name || '').trim().split(/\s+/).filter(Boolean);
                  const derivedFirst = derivedParts[0] || '';
                  const derivedLast = derivedParts.length > 1 ? derivedParts.slice(1).join(' ') : '';
                  const firstName = student.firstName || derivedFirst;
                  const lastName = student.lastName || derivedLast;

                  return (
                    <tr key={student._id} className="border-b border-slate-600 hover:bg-slate-700 hover:bg-opacity-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-primary">{student.studentId}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{student.hexadStudentId || '-'}</td>
                      <td className="px-4 py-3">{firstName}</td>
                      <td className="px-4 py-3">{lastName}</td>
                      <td className="px-4 py-3 text-slate-400">{student.email}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDelete(student.studentId)}
                          className="text-xs"
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
              >
                ← Previous
              </Button>
              <span className="text-sm text-slate-400">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page === totalPages - 1}
              >
                Next →
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8 text-slate-400">
          {students.length === 0 ? 'No students yet. Generate some!' : 'No results found.'}
        </div>
      )}
    </Card>
  );
};
