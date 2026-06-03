import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useAuth } from '../lib/AuthContext';
import { db, handleFirestoreError } from '../lib/firebase';
import { uploadStudentPhotoToCloudinary } from '../lib/cloudinary';
import { useCurrentMemberProfile } from '../lib/hooks';

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
        photoURL: member.photoURL || '',
      });
    } else if (user) {
      setFormData((current) => ({
        ...current,
        name: current.name || user.displayName || user.username || '',
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
    <div className="space-y-6 max-w-3xl mx-auto">
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
            <div className="flex items-center gap-4 rounded-md border bg-gray-50 p-4">
              <Avatar className="h-24 w-24">
                <AvatarImage src={previewPhotoURL} />
                <AvatarFallback className="text-2xl">{formData.name.charAt(0).toUpperCase() || 'M'}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-gray-900">{formData.name || 'Member photo'}</p>
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
              <Input id="phoneNumber" type="tel" required placeholder="+91" value={formData.phoneNumber} onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bloodGroup">Blood Group</Label>
              <Input id="bloodGroup" required placeholder="e.g. O+" value={formData.bloodGroup} onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="photoUpload">Member Photo (Optional)</Label>
              <Input id="photoUpload" type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate('/user')}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
