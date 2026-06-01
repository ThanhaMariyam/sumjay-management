import React, { useEffect, useMemo, useState } from 'react';
import { useStudents } from '../lib/hooks';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Student } from '../types';
import { uploadStudentPhotoToCloudinary } from '../lib/cloudinary';
import { SearchInput } from '../components/SearchInput';
import { Pagination } from '../components/Pagination';

const PAGE_SIZE = 10;

export default function Students() {
  const { students, loading } = useStudents();
  const [isOpen, setIsOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  const [formData, setFormData] = useState({
    name: '',
    dob: '',
    place: '',
    parentMobile: '',
    photoURL: ''
  });

  const filteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => {
      const searchable = `${student.name} ${student.dob} ${student.place} ${student.parentMobile}`.toLowerCase();
      return searchable.includes(query);
    });
  }, [students, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, students.length]);

  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredStudents.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredStudents, currentPage]);

  const getUploadWarning = (error: unknown) => {
    if (error instanceof Error && error.message === 'MISSING_CLOUDINARY_CONFIG') {
      return 'Photo upload skipped: Cloudinary is not configured in src/lib/cloudinary.ts.';
    }
    if (error instanceof Error && error.message === 'CLOUDINARY_UPLOAD_TIMEOUT') {
      return 'Photo upload skipped: upload timed out.';
    }
    if (error instanceof Error && error.message.startsWith('CLOUDINARY_UPLOAD_FAILED')) {
      const detail = error.message.replace('CLOUDINARY_UPLOAD_FAILED', '').trim();
      if (detail.toLowerCase().includes('upload preset not found')) {
        return 'Photo upload skipped: Cloudinary unsigned upload preset not found.';
      }
      return `Photo upload skipped${detail ? ` ${detail}` : '.'}`;
    }
    if (error instanceof Error && error.message === 'CLOUDINARY_UPLOAD_NO_URL') {
      return 'Photo upload skipped: Cloudinary did not return a URL.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setSaving(true);
    setSaveError('');
    try {
      let photoURL = formData.photoURL;
      let uploadWarning = '';
      if (photoFile) {
        try {
          photoURL = await uploadStudentPhotoToCloudinary(photoFile);
        } catch (uploadError) {
          const warning = getUploadWarning(uploadError);
          if (warning) {
            uploadWarning = `${warning} Student details will be saved without changing photo.`;
          } else {
            throw uploadError;
          }
        }
      }

      if (editingStudent?.id) {
        await updateDoc(doc(db, 'students', editingStudent.id), {
          ...formData,
          photoURL,
          updatedAt: Date.now()
        });
      } else {
        const payload: Student = {
          ...formData,
          photoURL,
          adminId: auth.currentUser.uid,
          createdAt: Date.now()
        };
        await addDoc(collection(db, 'students'), payload);
      }
      if (uploadWarning) {
        setSaveError(uploadWarning);
      }
      setIsOpen(false);
      setEditingStudent(null);
      setPhotoFile(null);
      setFormData({ name: '', dob: '', place: '', parentMobile: '', photoURL: '' });
    } catch (error) {
      const uploadWarning = getUploadWarning(error);
      if (uploadWarning) {
        setSaveError(uploadWarning);
      } else {
        setSaveError('Failed to save student. Please try again.');
        try {
          if (editingStudent?.id) {
            handleFirestoreError(error, 'update' as any, `students/${editingStudent.id}`);
          } else {
            handleFirestoreError(error, 'create' as any, 'students');
          }
        } catch (loggedError) {
          console.error(loggedError);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if(!confirm("Are you sure you want to delete this student?")) return;
    try {
      await deleteDoc(doc(db, 'students', id));
    } catch (error) {
      handleFirestoreError(error, 'delete' as any, `students/${id}`);
    }
  };

  const openEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      name: student.name,
      dob: student.dob,
      place: student.place,
      parentMobile: student.parentMobile,
      photoURL: student.photoURL || ''
    });
    setPhotoFile(null);
    setSaveError('');
    setIsOpen(true);
  };

  const openDetails = (student: Student) => {
    setSelectedStudent(student);
    setIsDetailsOpen(true);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Students</h1>
          <p className="text-gray-500">Manage student directory and details.</p>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingStudent(null);
              setPhotoFile(null);
              setSaveError('');
              setFormData({ name: '', dob: '', place: '', parentMobile: '', photoURL: '' });
            }}>Add Student</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingStudent ? 'Edit Student' : 'Add New Student'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input type="date" required value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Place</Label>
                <Input required value={formData.place} onChange={e => setFormData({...formData, place: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Parent WhatsApp Number</Label>
                <Input type="tel" required placeholder="+1234567890" value={formData.parentMobile} onChange={e => setFormData({...formData, parentMobile: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="photoUpload">Student Photo (Optional)</Label>
                <Input
                  id="photoUpload"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > 5 * 1024 * 1024) {
                      setPhotoFile(null);
                      setSaveError('Image is too large. Please choose an image under 5 MB.');
                      return;
                    }
                    setSaveError('');
                    setPhotoFile(file);
                  }}
                />
                {photoFile ? (
                  <p className="text-xs text-gray-500">Selected: {photoFile.name}</p>
                ) : formData.photoURL ? (
                  <p className="text-xs text-gray-500">Current photo is already set.</p>
                ) : null}
              </div>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog
        open={isDetailsOpen}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) {
            setSelectedStudent(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Student Details</DialogTitle>
          </DialogHeader>
          {selectedStudent && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-4">
                <Avatar className="h-28 w-28">
                  <AvatarImage src={selectedStudent.photoURL} />
                  <AvatarFallback>{selectedStudent.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-xl font-semibold text-gray-900">{selectedStudent.name}</p>
                  <p className="text-sm text-gray-500">Student profile</p>
                </div>
              </div>

              <div className="space-y-2 rounded-md border bg-gray-50 p-4 text-sm">
                <p><span className="font-medium text-gray-700">Date of Birth:</span> {selectedStudent.dob}</p>
                <p><span className="font-medium text-gray-700">Place:</span> {selectedStudent.place}</p>
                <p><span className="font-medium text-gray-700">Parent WhatsApp:</span> {selectedStudent.parentMobile}</p>
              </div>

              <Button type="button" className="w-full" onClick={() => setIsDetailsOpen(false)}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SearchInput
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Search by name, DOB, place or parent mobile"
      />

      <div className="border rounded-md bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>DOB</TableHead>
              <TableHead>Place</TableHead>
              <TableHead>Parent Mobile</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filteredStudents.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-gray-500 py-8">No students found. Add one to get started.</TableCell></TableRow>
            ) : (
              paginatedStudents.map(student => (
                <TableRow
                  key={student.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => openDetails(student)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={student.photoURL} />
                        <AvatarFallback>{student.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{student.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{student.dob}</TableCell>
                  <TableCell>{student.place}</TableCell>
                  <TableCell>{student.parentMobile}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(student);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (student.id) {
                          handleDelete(student.id);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!loading && (
        <Pagination
          currentPage={currentPage}
          pageSize={PAGE_SIZE}
          totalItems={filteredStudents.length}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}
