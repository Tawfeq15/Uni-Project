import React, { useState, useEffect } from 'react';
import { roomsAPI } from '../api';
import { useToast } from '../components/Toast';

export default function Rooms() {
  const { showToast } = useToast();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRoom, setEditingRoom] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    room_name: '',
    faculty: '',
    room_type: 'room',
    capacity: 0,
    vlan_id: '',
    subnet_pattern: '',
    is_active: true,
    notes: ''
  });

  const loadRooms = async () => {
    try {
      setLoading(true);
      const data = await roomsAPI.list();
      setRooms(data || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  const handleOpenModal = (room = null) => {
    if (room) {
      setEditingRoom(room.id);
      setFormData({
        room_name: room.room_name || '',
        faculty: room.faculty || '',
        room_type: room.room_type || 'room',
        capacity: room.capacity || 0,
        vlan_id: room.vlan_id || '',
        subnet_pattern: room.subnet_pattern || '',
        is_active: room.is_active === 1 || room.is_active === true,
        notes: room.notes || ''
      });
    } else {
      setEditingRoom(null);
      setFormData({
        room_name: '', faculty: '', room_type: 'room', capacity: 0,
        vlan_id: '', subnet_pattern: '', is_active: true, notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        capacity: parseInt(formData.capacity) || 0,
        vlan_id: formData.vlan_id ? parseInt(formData.vlan_id) : null,
      };

      if (editingRoom) {
        await roomsAPI.update(editingRoom, payload);
        showToast('تم تحديث القاعة بنجاح', 'success');
      } else {
        await roomsAPI.create(payload);
        showToast('تمت إضافة القاعة بنجاح', 'success');
      }
      setIsModalOpen(false);
      loadRooms();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه القاعة؟')) return;
    try {
      await roomsAPI.delete(id);
      showToast('تم الحذف بنجاح', 'success');
      loadRooms();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">إدارة القاعات والمختبرات</h1>
          <p className="page-subtitle">إدارة سعة القاعات وتفاصيل الشبكات الخاصة بها</p>
        </div>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>➕ إضافة قاعة</button>
      </div>

      {loading ? (
        <div className="loading">جاري التحميل...</div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>اسم القاعة</th>
                  <th>الكلية</th>
                  <th>النوع</th>
                  <th>السعة</th>
                  <th>VLAN</th>
                  <th>Subnet</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rooms.length === 0 ? (
                  <tr><td colSpan="8" className="text-center">لا توجد قاعات</td></tr>
                ) : rooms.map(r => (
                  <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.6 }}>
                    <td className="fw-bold">{r.room_name}</td>
                    <td>{r.faculty === 'it' ? 'تكنولوجيا المعلومات' : r.faculty === 'media' ? 'الإعلام' : r.faculty === 'arts' ? 'الآداب' : r.faculty}</td>
                    <td><span className={`badge ${r.room_type === 'lab' ? 'badge-primary' : 'badge-secondary'}`}>{r.room_type === 'lab' ? 'مختبر' : 'قاعة صفية'}</span></td>
                    <td>{r.capacity} طالب</td>
                    <td>{r.vlan_id ? <span className="badge badge-warning">VLAN {r.vlan_id}</span> : '-'}</td>
                    <td dir="ltr" className="text-end">{r.subnet_pattern || '-'}</td>
                    <td>{r.is_active ? <span className="text-success">فعال</span> : <span className="text-danger">معطل</span>}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn btn-sm btn-secondary" onClick={() => handleOpenModal(r)}>تعديل</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r.id)}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{maxWidth: '600px'}}>
            <div className="modal-header">
              <h3>{editingRoom ? 'تعديل بيانات القاعة' : 'إضافة قاعة جديدة'}</h3>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>اسم / رقم القاعة</label>
                  <input type="text" className="form-control" required value={formData.room_name} onChange={e => setFormData({...formData, room_name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>الكلية</label>
                  <select className="form-control" required value={formData.faculty} onChange={e => setFormData({...formData, faculty: e.target.value})}>
                    <option value="">اختر الكلية</option>
                    <option value="it">تكنولوجيا المعلومات</option>
                    <option value="media">الإعلام</option>
                    <option value="arts">الآداب</option>
                    <option value="library">المكتبة</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>النوع</label>
                  <select className="form-control" value={formData.room_type} onChange={e => setFormData({...formData, room_type: e.target.value})}>
                    <option value="room">قاعة صفية</option>
                    <option value="lab">مختبر حاسوب</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>السعة القصوى للطلاب</label>
                  <input type="number" min="0" className="form-control" required value={formData.capacity} onChange={e => setFormData({...formData, capacity: e.target.value})} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>VLAN ID (اختياري)</label>
                  <input type="number" className="form-control" value={formData.vlan_id} onChange={e => setFormData({...formData, vlan_id: e.target.value})} placeholder="مثال: 153" />
                </div>
                <div className="form-group">
                  <label>Subnet Pattern (اختياري)</label>
                  <input type="text" className="form-control" dir="ltr" value={formData.subnet_pattern} onChange={e => setFormData({...formData, subnet_pattern: e.target.value})} placeholder="172.16.153.x" />
                </div>
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea className="form-control" rows="2" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}></textarea>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} />
                  القاعة فعالة ومتاحة للاستخدام
                </label>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>إلغاء</button>
                <button type="submit" className="btn btn-primary">حفظ البيانات</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
