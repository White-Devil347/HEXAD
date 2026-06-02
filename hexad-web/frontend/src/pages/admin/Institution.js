import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import { Plus, Edit, Building, BookOpen, Users } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const Institution = () => {
    const location = useLocation();
    const [activeTab, setActiveTab] = useState('departments');
    const [departments, setDepartments] = useState([]);
    const [classes, setClasses] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [modalType, setModalType] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        const hash = String(location.hash || '').replace('#', '').trim().toLowerCase();
        if (hash === 'departments' || hash === 'classes' || hash === 'subjects') {
            setActiveTab(hash);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.hash]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [deptRes, classRes, subjectRes] = await Promise.all([
                adminAPI.getDepartments(),
                adminAPI.getClasses(),
                adminAPI.getSubjects()
            ]);
            setDepartments(deptRes.data.data);
            setClasses(classRes.data.data);
            setSubjects(subjectRes.data.data);
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    const openModal = (type, item = null) => {
        setModalType(type);
        setEditingItem(item);
        setShowModal(true);
    };

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
                <h1 className="page-title">Institution Structure</h1>
            </div>

            {/* Tabs */}
            <div className="tabs mb-4">
                <button
                    className={`tab ${activeTab === 'departments' ? 'active' : ''}`}
                    onClick={() => setActiveTab('departments')}
                >
                    <Building size={16} /> Departments
                </button>
                <button
                    className={`tab ${activeTab === 'classes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('classes')}
                >
                    <Users size={16} /> Classes
                </button>
                <button
                    className={`tab ${activeTab === 'subjects' ? 'active' : ''}`}
                    onClick={() => setActiveTab('subjects')}
                >
                    <BookOpen size={16} /> Subjects
                </button>
            </div>

            {/* Departments Tab */}
            {activeTab === 'departments' && (
                <div className="card">
                    <div className="card-header flex-between">
                        <h3 className="card-title">Departments</h3>
                        <button className="btn btn-primary" onClick={() => openModal('department')}>
                            <Plus size={16} /> Add Department
                        </button>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Name</th>
                                    <th>Years</th>
                                    <th>Classes</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {departments.length > 0 ? (
                                    departments.map((dept) => (
                                        <tr key={dept.id}>
                                            <td><code>{dept.code}</code></td>
                                            <td>{dept.name}</td>
                                            <td>{dept.yearsCount ?? dept.years_count ?? '-'}</td>
                                            <td>{classes.filter(c => c.departmentId === dept.id).length}</td>
                                            <td>
                                                <div className="flex-center gap-1">
                                                    <button
                                                        className="btn btn-sm btn-outline"
                                                        onClick={() => openModal('department', dept)}
                                                    >
                                                        <Edit size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" className="text-center">No departments found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Classes Tab */}
            {activeTab === 'classes' && (
                <div className="card">
                    <div className="card-header flex-between">
                        <h3 className="card-title">Classes</h3>
                        <button className="btn btn-primary" onClick={() => openModal('class')}>
                            <Plus size={16} /> Add Class
                        </button>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Code</th>
                                    <th>Department</th>
                                    <th>Academic Year</th>
                                    <th>Semester</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {classes.length > 0 ? (
                                    classes.map((cls) => (
                                        <tr key={cls.id}>
                                            <td>{cls.name}</td>
                                            <td><code>{cls.code}</code></td>
                                            <td>{departments.find((d) => d.id === cls.departmentId)?.name || '-'}</td>
                                            <td>{cls.academicYear || '-'}</td>
                                            <td>{cls.semester ?? '-'}</td>
                                            <td>
                                                <div className="flex-center gap-1">
                                                    <button
                                                        className="btn btn-sm btn-outline"
                                                        onClick={() => openModal('class', cls)}
                                                    >
                                                        <Edit size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="6" className="text-center">No classes found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Subjects Tab */}
            {activeTab === 'subjects' && (
                <div className="card">
                    <div className="card-header flex-between">
                        <h3 className="card-title">Subjects</h3>
                        <button className="btn btn-primary" onClick={() => openModal('subject')}>
                            <Plus size={16} /> Add Subject
                        </button>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Name</th>
                                    <th>Department</th>
                                    <th>Credits</th>
                                </tr>
                            </thead>
                            <tbody>
                                {subjects.length > 0 ? (
                                    subjects.map((subject) => (
                                        <tr key={subject.id}>
                                            <td><code>{subject.code}</code></td>
                                            <td>{subject.name}</td>
                                            <td>{departments.find((d) => d.id === subject.departmentId)?.name || '-'}</td>
                                            <td>{subject.credits || '-'}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="text-center">No subjects found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <ItemModal
                    type={modalType}
                    item={editingItem}
                    departments={departments}
                    onClose={() => { setShowModal(false); setEditingItem(null); }}
                    onSuccess={() => {
                        setShowModal(false);
                        setEditingItem(null);
                        fetchData();
                    }}
                />
            )}
        </div>
    );
};

// Item Modal Component
const ItemModal = ({ type, item, departments, onClose, onSuccess }) => {
    const toast = useToast();
    const [formData, setFormData] = useState({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (type === 'department') {
            setFormData({
                code: item?.code || '',
                name: item?.name || '',
                yearsCount: item?.yearsCount ?? item?.years_count ?? 4,
                isActive: item?.isActive !== false
            });
        } else if (type === 'class') {
            setFormData({
                name: item?.name || '',
                code: item?.code || '',
                departmentId: item?.departmentId || '',
                semester: item?.semester ?? '',
                academicYear: item?.academicYear || new Date().getFullYear().toString(),
                isActive: item?.isActive !== false
            });
        } else if (type === 'subject') {
            setFormData({
                code: item?.code || '',
                name: item?.name || '',
                departmentId: item?.departmentId || '',
                credits: item?.credits || 3
            });
        }
    }, [type, item]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (type === 'department') {
                const payload = {
                    ...formData,
                    yearsCount: formData?.yearsCount === '' || formData?.yearsCount === null || formData?.yearsCount === undefined
                        ? undefined
                        : parseInt(formData.yearsCount, 10)
                };
                if (item) {
                    await adminAPI.updateDepartment(item.id, payload);
                } else {
                    await adminAPI.createDepartment(payload);
                }
            } else if (type === 'class') {
                if (item) {
                    await adminAPI.updateClass(item.id, formData);
                } else {
                    await adminAPI.createClass(formData);
                }
            } else if (type === 'subject') {
                await adminAPI.createSubject(formData);
            }
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || `Failed to save ${type}`);
        } finally {
            setSubmitting(false);
        }
    };

    const getTitle = () => {
        const action = item ? 'Edit' : 'Add';
        return `${action} ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <h3 className="modal-title">{getTitle()}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    {type === 'department' && (
                        <>
                            <div className="form-group">
                                <label className="form-label">Code *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                    required
                                    placeholder="e.g., CSE"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Name *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                    placeholder="e.g., Computer Science & Engineering"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Number of Years *</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.yearsCount}
                                    onChange={(e) => setFormData({ ...formData, yearsCount: e.target.value })}
                                    min={1}
                                    max={20}
                                    required
                                    placeholder="e.g., 4"
                                />
                            </div>
                            <div className="form-group">
                                <label className="flex-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                    />
                                    Active
                                </label>
                            </div>
                        </>
                    )}

                    {type === 'class' && (
                        <>
                            <div className="form-group">
                                <label className="form-label">Name *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                    placeholder="e.g., CSE-A 3rd Year"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Code *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                    required
                                    placeholder="e.g., CSE-A"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Department *</label>
                                <select
                                    className="form-input"
                                    value={formData.departmentId}
                                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                                    required
                                >
                                    <option value="">Select Department</option>
                                    {departments.map(dept => (
                                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">Semester</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.semester}
                                        onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                                        placeholder="e.g., 5"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Academic Year</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.academicYear}
                                        onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                                        placeholder="e.g., 2024"
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="flex-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                    />
                                    Active
                                </label>
                            </div>
                        </>
                    )}

                    {type === 'subject' && (
                        <>
                            <div className="grid grid-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">Code *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.code}
                                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                        required
                                        placeholder="e.g., CS301"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Name *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                        placeholder="e.g., Data Structures"
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Department *</label>
                                <select
                                    className="form-input"
                                    value={formData.departmentId}
                                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                                    required
                                >
                                    <option value="">Select Department</option>
                                    {departments.map(dept => (
                                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">Credits</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={formData.credits}
                                        onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) })}
                                        min={1}
                                        max={10}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Saving...' : item ? 'Update' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Institution;
