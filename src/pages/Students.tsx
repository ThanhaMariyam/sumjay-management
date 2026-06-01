import React, { useEffect, useMemo, useState } from 'react';
import { useStudents } from '../lib/hooks';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { db, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Student } from '../types';
import { uploadStudentPhotoToCloudinary } from '../lib/cloudinary';
import { SearchInput } from '../components/SearchInput';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../lib/AuthContext';
import { Phone } from 'lucide-react';

const PAGE_SIZE = 10;

export default function Students() {
  const { user, isMembershipAdmin } = useAuth();
  const collectionName = isMembershipAdmin ? 'members' : 'students';
  const itemLabel = isMembershipAdmin ? 'Member' : 'Student';
  const { students, loading } = useStudents(collectionName);
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
    phoneNumber: '',
    bloodGroup: '',
    photoURL: ''
  });

  const contactValue = (student: Student) => (isMembershipAdmin ? (student.phoneNumber || '') : student.parentMobile);
  const phoneHref = (phone: string) => `tel:${phone.replace(/\s+/g, '')}`;

  const filteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => {
      const searchable = `${student.name} ${student.dob} ${student.place} ${contactValue(student)} ${student.bloodGroup || ''}`.toLowerCase();
      return searchable.includes(query);
    });
  }, [students, searchTerm, isMembershipAdmin]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, students.length]);

  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredStudents.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredStudents, currentPage]);

  const getUploadWarning = (error: unknown) => {
    if (error instanceof Error && error.message === 'MISSING_CLOUDINARY_CONFIG') return 'Photo upload skipped: Cloudinary is not configured.';
    if (error instanceof Error && error.message === 'CLOUDINARY_UPLOAD_TIMEOUT') return 'Photo upload skipped: upload timed out.';
    if (error instanceof Error && error.message.startsWith('CLOUDINARY_UPLOAD_FAILED')) return 'Photo upload skipped.';
    if (error instanceof Error && error.message === 'CLOUDINARY_UPLOAD_NO_URL') return 'Photo upload skipped: Cloudinary did not return a URL.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaveError('');
    try {
      let photoURL = formData.photoURL;
      if (photoFile) {
        try {
          photoURL = await uploadStudentPhotoToCloudinary(photoFile);
        } catch (uploadError) {
          const warning = getUploadWarning(uploadError);
          if (warning) setSaveError(`${warning} Details will be saved without changing photo.`);
          else throw uploadError;
        }
      }

      const payload = {
        name: formData.name,
        dob: formData.dob,
        place: formData.place,
        photoURL,
        adminId: user.adminId,
        ...(isMembershipAdmin
          ? { phoneNumber: formData.phoneNumber, bloodGroup: formData.bloodGroup }
          : { parentMobile: formData.parentMobile }),
      };

      if (editingStudent?.id) {
        await updateDoc(doc(db, collectionName, editingStudent.id), {
          ...payload,
          updatedAt: Date.now(),
        });
      } else {
        await addDoc(collection(db, collectionName), {
          ...payload,
          createdAt: Date.now(),
        });
      }

      setIsOpen(false);
      setEditingStudent(null);
      setPhotoFile(null);
      setFormData({ name: '', dob: '', place: '', parentMobile: '', phoneNumber: '', bloodGroup: '', photoURL: '' });
    } catch (error) {
      setSaveError(`Failed to save ${itemLabel.toLowerCase()}. Please try again.`);
      handleFirestoreError(error, 'write' as any, collectionName);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Are you sure you want to delete this ${itemLabel.toLowerCase()}?`)) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (error) {
      handleFirestoreError(error, 'delete' as any, `${collectionName}/${id}`);
    }
  };

  const openEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      name: student.name,
      dob: student.dob,
      place: student.place,
      parentMobile: student.parentMobile || '',
      phoneNumber: student.phoneNumber || '',
      bloodGroup: student.bloodGroup || '',
      photoURL: student.photoURL || ''
    });
    setPhotoFile(null);
    setSaveError('');
    setIsOpen(true);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">{itemLabel}s</h1>
          <p className="text-gray-500">Manage {itemLabel.toLowerCase()} directory and details.</p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingStudent(null);
              setPhotoFile(null);
              setSaveError('');
              setFormData({ name: '', dob: '', place: '', parentMobile: '', phoneNumber: '', bloodGroup: '', photoURL: '' });
            }}>Add {itemLabel}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingStudent ? `Edit ${itemLabel}` : `Add New ${itemLabel}`}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input type="date" required value={formData.dob} onChange={e => setFormData({ ...formData, dob: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Place</Label>
                <Input required value={formData.place} onChange={e => setFormData({ ...formData, place: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{isMembershipAdmin ? 'Phone Number' : 'Parent WhatsApp Number'}</Label>
                <Input
                  type="tel"
                  required
                  placeholder="+91"
                  value={isMembershipAdmin ? formData.phoneNumber : formData.parentMobile}
                  onChange={e => setFormData({ ...formData, [isMembershipAdmin ? 'phoneNumber' : 'parentMobile']: e.target.value })}
                />
              </div>
              {isMembershipAdmin && (
                <div className="space-y-2">
                  <Label>Blood Group</Label>
                  <Input required placeholder="e.g. O+" value={formData.bloodGroup} onChange={e => setFormData({ ...formData, bloodGroup: e.target.value })} />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="photoUpload">{itemLabel} Photo (Optional)</Label>
                <Input id="photoUpload" type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
              </div>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
              <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={isDetailsOpen} onOpenChange={(open) => { setIsDetailsOpen(open); if (!open) setSelectedStudent(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{itemLabel} Details</DialogTitle>
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
                  <p className="text-sm text-gray-500">{itemLabel} profile</p>
                </div>
              </div>
              <div className="space-y-2 rounded-md border bg-gray-50 p-4 text-sm">
                <p><span className="font-medium text-gray-700">Date of Birth:</span> {selectedStudent.dob}</p>
                <p><span className="font-medium text-gray-700">Place:</span> {selectedStudent.place}</p>
                <p><span className="font-medium text-gray-700">{isMembershipAdmin ? 'Phone Number' : 'Parent WhatsApp'}:</span> {contactValue(selectedStudent)}</p>
                <a
                  href={phoneHref(contactValue(selectedStudent))}
                  className="inline-flex items-center gap-2 text-green-600 hover:text-green-700 hover:underline"
                >
                  <Phone className="h-4 w-4" />
                  Call Now
                </a>
                {isMembershipAdmin && <p><span className="font-medium text-gray-700">Blood Group:</span> {selectedStudent.bloodGroup}</p>}
              </div>
              <Button type="button" className="w-full" onClick={() => setIsDetailsOpen(false)}>Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SearchInput
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder={isMembershipAdmin ? 'Search by name, DOB, place, phone, blood group' : 'Search by name, DOB, place or parent mobile'}
      />

      <div className="border rounded-md bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{itemLabel}</TableHead>
              <TableHead>DOB</TableHead>
              <TableHead>Place</TableHead>
              <TableHead>{isMembershipAdmin ? 'Phone Number' : 'Parent Mobile'}</TableHead>
              {isMembershipAdmin && <TableHead>Blood Group</TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={isMembershipAdmin ? 6 : 5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filteredStudents.length === 0 ? (
              <TableRow><TableCell colSpan={isMembershipAdmin ? 6 : 5} className="text-center text-gray-500 py-8">No {itemLabel.toLowerCase()}s found. Add one to get started.</TableCell></TableRow>
            ) : (
              paginatedStudents.map(student => (
                <TableRow key={student.id} className="cursor-pointer hover:bg-gray-50" onClick={() => { setSelectedStudent(student); setIsDetailsOpen(true); }}>
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
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{contactValue(student)}</span>
                      <a
                        href={phoneHref(contactValue(student))}
                        className="inline-flex items-center text-green-600 hover:text-green-700"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Call ${student.name}`}
                        title={`Call ${student.name}`}
                      >
                        <Phone className="h-4 w-4" />
                      </a>
                    </div>
                  </TableCell>
                  {isMembershipAdmin && <TableCell>{student.bloodGroup}</TableCell>}
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(student); }}>Edit</Button>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); if (student.id) handleDelete(student.id); }}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!loading && (
        <Pagination currentPage={currentPage} pageSize={PAGE_SIZE} totalItems={filteredStudents.length} onPageChange={setCurrentPage} />
      )}
    </div>
  );
}
