import React, { useState, useEffect } from 'react';
import { teacherAPI } from '../../services/api';
import { FileSpreadsheet, FileText, Download, Calendar, Filter } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const Reports = () => {
    const toast = useToast();
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [filters, setFilters] = useState({
        department_id: '',
        class_id: '',
        subject_id: '',
        start_date: '',
        end_date: ''
    });

    useEffect(() => {
        fetchAssignments();
    }, []);

    const fetchAssignments = async () => {
        try {
            const response = await teacherAPI.getAssignments();
            setAssignments(response.data.data);
        } catch (error) {
            console.error('Failed to fetch assignments:', error);
        } finally {
            setLoading(false);
        }
    };

    const tryGetErrorMessageFromBlob = async (blob) => {
        try {
            if (!blob) return null;
            const text = await blob.text();
            if (!text) return null;
            const parsed = JSON.parse(text);
            return parsed?.message || null;
        } catch (_) {
            return null;
        }
    };

    const parseFilenameFromDisposition = (contentDisposition, fallback) => {
        const value = String(contentDisposition || '');
        const m = value.match(/filename\*?=(?:UTF-8''|")?([^;"\n]+)/i);
        if (!m) return fallback;
        const raw = m[1].trim().replace(/^"|"$/g, '');
        try {
            return decodeURIComponent(raw);
        } catch (_) {
            return raw;
        }
    };

    const triggerBrowserDownload = ({ blob, filename }) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    const handleExport = async (format) => {
        if (!filters.department_id) {
            toast.error('Please select a department');
            return;
        }

        if (!filters.class_id) {
            toast.error('Please select a class');
            return;
        }

        const exportFormat = format === 'pdf' ? 'pdf' : 'excel';

        setGenerating(true);
        try {
            let response;
            const exportFilters = {
                class_id: filters.class_id,
                subject_id: filters.subject_id,
                start_date: filters.start_date,
                end_date: filters.end_date
            };

            if (exportFormat === 'excel') {
                response = await teacherAPI.exportExcel(exportFilters);
            } else {
                response = await teacherAPI.exportPDF(exportFilters);
            }

            const mime = exportFormat === 'excel'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'application/pdf';

            // axios with responseType:'blob' returns a Blob already.
            const blob = response?.data instanceof Blob ? response.data : new Blob([response.data], { type: mime });
            const fallbackName = `attendance_report_${Date.now()}.${exportFormat === 'excel' ? 'xlsx' : 'pdf'}`;
            const filename = parseFilenameFromDisposition(response?.headers?.['content-disposition'], fallbackName);

            triggerBrowserDownload({ blob, filename });
        } catch (error) {
            const blobMessage = await tryGetErrorMessageFromBlob(error?.response?.data);
            toast.error(blobMessage || error.response?.data?.message || error.message || 'Failed to generate report');
        } finally {
            setGenerating(false);
        }
    };

    const handleMonthlyReport = async () => {
        if (!filters.department_id) {
            toast.error('Please select a department');
            return;
        }

        if (!filters.class_id) {
            toast.error('Please select a class');
            return;
        }

        const currentDate = new Date();
        const month = currentDate.getMonth() + 1;
        const year = currentDate.getFullYear();

        setGenerating(true);
        try {
            const response = await teacherAPI.generateMonthlyReport({
                class_id: filters.class_id,
                subject_id: filters.subject_id,
                month,
                year
            });

            // Download generated report as JSON
            const payload = response.data?.data ?? response.data;
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `monthly_report_${month}_${year}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to generate monthly report');
        } finally {
            setGenerating(false);
        }
    };

    const uniqueDepartments = [...new Map(assignments.map((a) => [
        a.department_id || a.department_name || 'unknown',
        {
            id: a.department_id || a.department_name || 'unknown',
            name: a.department_name || 'Unknown Department'
        }
    ])).values()];

    const filteredAssignments = assignments.filter((a) => {
        if (!filters.department_id) return false;

        const depKey = a.department_id || a.department_name || 'unknown';
        if (String(depKey) !== String(filters.department_id)) return false;

        if (filters.class_id && String(a.class_id) !== String(filters.class_id)) return false;
        return true;
    });

    const uniqueClasses = [...new Map(
        filteredAssignments.map((a) => [a.class_id, { id: a.class_id, name: a.class_name }])
    ).values()];

    const uniqueSubjects = [...new Map(
        filteredAssignments
            .filter((a) => !filters.class_id || String(a.class_id) === String(filters.class_id))
            .map((a) => [a.subject_id, { id: a.subject_id, name: a.subject_name }])
    ).values()];

    useEffect(() => {
        // If department changes, reset dependent selections.
        setFilters((prev) => ({
            ...prev,
            class_id: '',
            subject_id: ''
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.department_id]);

    useEffect(() => {
        // If class changes, reset subject.
        setFilters((prev) => ({
            ...prev,
            subject_id: ''
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.class_id]);

    if (loading) {
        return (
            <div className="loading">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Reports</h1>
            </div>

            {/* Filter Card */}
            <div className="card mb-4">
                <div className="card-header">
                    <h3 className="card-title">
                        <Filter size={20} /> Report Filters
                    </h3>
                </div>
                <div className="grid grid-2 gap-4">
                    <div className="form-group">
                        <label className="form-label">Department *</label>
                        <select
                            className="form-input"
                            value={filters.department_id}
                            onChange={(e) => setFilters({ ...filters, department_id: e.target.value })}
                        >
                            <option value="">Select Department</option>
                            {uniqueDepartments.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Class *</label>
                        <select
                            className="form-input"
                            value={filters.class_id}
                            onChange={(e) => setFilters({ ...filters, class_id: e.target.value })}
                            disabled={!filters.department_id}
                        >
                            <option value="">Select Class</option>
                            {uniqueClasses.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        {!filters.department_id && <small className="text-gray">Select a department first.</small>}
                    </div>
                    <div className="form-group">
                        <label className="form-label">Subject (Optional)</label>
                        <select
                            className="form-input"
                            value={filters.subject_id}
                            onChange={(e) => setFilters({ ...filters, subject_id: e.target.value })}
                            disabled={!filters.department_id || !filters.class_id}
                        >
                            <option value="">All Subjects</option>
                            {uniqueSubjects.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        {(!filters.department_id || !filters.class_id) && <small className="text-gray">Select department and class to filter subjects.</small>}
                    </div>
                    <div className="form-group">
                        <label className="form-label">Start Date</label>
                        <input
                            type="date"
                            className="form-input"
                            value={filters.start_date}
                            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">End Date</label>
                        <input
                            type="date"
                            className="form-input"
                            value={filters.end_date}
                            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                        />
                    </div>
                </div>
            </div>

            {/* Export Options */}
            <div className="grid grid-3 gap-4">
                {/* Excel Export */}
                <div className="card">
                    <div className="card-header">
                        <FileSpreadsheet size={32} color="#22c55e" />
                    </div>
                    <h3>Excel Report</h3>
                    <p className="text-gray mb-4">
                        Export attendance data to Excel format with detailed records, 
                        student-wise breakdown, and session summaries.
                    </p>
                    <button
                        className="btn btn-success w-full"
                        onClick={() => {
                            handleExport('excel');
                        }}
                        disabled={generating || !filters.department_id || !filters.class_id}
                    >
                        <Download size={16} />
                        {generating ? 'Generating...' : 'Download Excel'}
                    </button>
                </div>

                {/* PDF Export */}
                <div className="card">
                    <div className="card-header">
                        <FileText size={32} color="#ef4444" />
                    </div>
                    <h3>PDF Report</h3>
                    <p className="text-gray mb-4">
                        Generate a formatted PDF report suitable for printing 
                        and official documentation purposes.
                    </p>
                    <button
                        className="btn btn-danger w-full"
                        onClick={() => {
                            handleExport('pdf');
                        }}
                        disabled={generating || !filters.department_id || !filters.class_id}
                    >
                        <Download size={16} />
                        {generating ? 'Generating...' : 'Download PDF'}
                    </button>
                </div>

                {/* Monthly Report */}
                <div className="card">
                    <div className="card-header">
                        <Calendar size={32} color="#3b82f6" />
                    </div>
                    <h3>Monthly Report</h3>
                    <p className="text-gray mb-4">
                        Generate a comprehensive monthly attendance summary 
                        with statistics and insights.
                    </p>
                    <button
                        className="btn btn-primary w-full"
                        onClick={handleMonthlyReport}
                        disabled={generating || !filters.department_id || !filters.class_id}
                    >
                        <Download size={16} />
                        {generating ? 'Generating...' : 'Generate Monthly'}
                    </button>
                </div>
            </div>

            {/* Report Info */}
            <div className="card mt-4">
                <div className="card-header">
                    <h3 className="card-title">Report Information</h3>
                </div>
                <div className="grid grid-2 gap-4">
                    <div>
                        <h4>Excel Report Contents:</h4>
                        <ul className="list-disc ml-4 text-gray">
                            <li>Session-wise attendance records</li>
                            <li>Student attendance percentage</li>
                            <li>Verification status breakdown</li>
                            <li>Late arrivals and absences</li>
                        </ul>
                    </div>
                    <div>
                        <h4>PDF Report Contents:</h4>
                        <ul className="list-disc ml-4 text-gray">
                            <li>Formatted attendance sheets</li>
                            <li>Summary statistics</li>
                            <li>Suitable for official records</li>
                            <li>Print-ready format</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Note */}
            <div className="alert alert-info mt-4">
                <strong>Note:</strong> Reports are generated based on the selected filters. 
                If no date range is specified, all available data for the selected class will be included.
            </div>
        </div>
    );
};

export default Reports;
