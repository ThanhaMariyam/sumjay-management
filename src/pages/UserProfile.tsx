import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useAuth } from '../lib/AuthContext';
import { db, handleFirestoreError } from '../lib/firebase';
import { uploadStudentPhotoToCloudinary } from '../lib/cloudinary';
import { useCurrentMemberProfile } from '../lib/hooks';
import { MemberRole } from '../types';
import { PhoneNumberInput } from '../components/PhoneNumberInput';

const PENDING_MEMBER_ROLE_KEY = 'sumjay.pendingMemberRole';

export default function UserProfile() {
  const { user } = useAuth();
  const { member, loading } = useCurrentMemberProfile();
  const navigate = useNavigate();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewPhotoURL, setPreviewPhotoURL] = useState('');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    dob: '',
    place: '',
    phoneNumber: '',
    bloodGroup: '',
    memberRole: 'local' as MemberRole,
    photoURL: '',
  });

  useEffect(() => {
    if (member) {
      setFormData({
        name: member.name || '',
        dob: member.dob || '',
        place: member.place || '',
        phoneNumber: member.phoneNumber || '',
        bloodGroup: member.bloodGroup || '',
        memberRole: member.memberRole || 'local',
        photoURL: member.photoURL || '',
      });
    } else if (user) {
      const pendingMemberRole = sessionStorage.getItem(PENDING_MEMBER_ROLE_KEY);
      setFormData((current) => ({
        ...current,
        name: current.name || user.displayName || user.username || '',
        memberRole: pendingMemberRole === 'abroad' ? 'abroad' : current.memberRole,
      }));
    }
  }, [member, user]);

  useEffect(() => {
    if (!photoFile) {
      setPreviewPhotoURL(formData.photoURL);
      return;
    }

    const objectURL = URL.createObjectURL(photoFile);
    setPreviewPhotoURL(objectURL);
    return () => URL.revokeObjectURL(objectURL);
  }, [photoFile, formData.photoURL]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      let photoURL = formData.photoURL;
      if (photoFile) {
        try {
          photoURL = await uploadStudentPhotoToCloudinary(photoFile);
        } catch {
          toast.warning('Photo upload skipped. Profile details will still be saved.');
        }
      }

      const payload = {
        adminId: user.adminId,
        userId: user.adminId,
        email: user.email || '',
        name: formData.name,
        dob: formData.dob,
        place: formData.place,
        phoneNumber: formData.phoneNumber,
        bloodGroup: formData.bloodGroup,
        memberRole: formData.memberRole,
        photoURL,
      };

      if (member?.id) {
        await updateDoc(doc(db, 'members', member.id), {
          ...payload,
          createdAt: member.createdAt,
          updatedAt: Date.now(),
        });
        toast.success('Profile updated.');
      } else {
        const newDocRef = doc(collection(db, 'members'));
        await setDoc(newDocRef, {
          ...payload,
          createdAt: Date.now(),
        });
        toast.success('Profile created.');
      }
      sessionStorage.removeItem(PENDING_MEMBER_ROLE_KEY);
      setPhotoFile(null);
      navigate('/user');
    } catch (error) {
      toast.error('Failed to save profile.');
      handleFirestoreError(error, 'write' as any, 'members');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto text-gray-500">Loading...</div>;
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">{member ? 'Edit Profile' : 'Create Profile'}</h1>
        <p className="text-gray-500">Your profile uses the same member details shown to membership admin.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Member Details</CardTitle>
          <CardDescription>Membership admin can view this profile in the members page.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-4 rounded-md border bg-gray-50 p-4 sm:flex-row sm:items-center">
              <Avatar className="h-24 w-24 shrink-0">
                <AvatarImage src={previewPhotoURL} />
                <AvatarFallback className="text-2xl">{formData.name.charAt(0).toUpperCase() || 'M'}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="break-words font-medium text-gray-900">{formData.name || 'Member photo'}</p>
                <p className="text-sm text-gray-500">Uploaded photo will be shown on your dashboard and profile.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dob">Date of Birth</Label>
              <Input id="dob" type="date" required value={formData.dob} onChange={(e) => setFormData({ ...formData, dob: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="place">Place</Label>
              <Input id="place" required value={formData.place} onChange={(e) => setFormData({ ...formData, place: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <PhoneNumberInput
                id="phoneNumber"
                required
                value={formData.phoneNumber}
                onChange={(value) => setFormData({ ...formData, phoneNumber: value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bloodGroup">Blood Group</Label>
              <Input id="bloodGroup" required placeholder="e.g. O+" value={formData.bloodGroup} onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={formData.memberRole} onValueChange={(value) => setFormData({ ...formData, memberRole: value as MemberRole })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="abroad">Abroad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="photoUpload">Member Photo (Optional)</Label>
              <Input id="photoUpload" type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => navigate('/user')}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
