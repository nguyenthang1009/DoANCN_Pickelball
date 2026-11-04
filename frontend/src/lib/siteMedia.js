// Danh mục mọi vị trí ảnh của hệ thống. Admin thay ảnh và điểm lấy nét theo từng vị trí;
// vị trí chưa thay thì dùng ảnh mặc định ở đây. Ảnh riêng của khách hàng không nằm trong danh mục này.
const item = (label, file, alt, focusX = 50, focusY = 50) => ({ label, src: `/images/site/${file}.webp`, alt, focusX, focusY });

export const MEDIA_GROUPS = [
  ['hero', 'Slider trang chủ', 'Khổ ngang rất rộng, chữ nằm bên trái'],
  ['section', 'Các mục trang chủ', 'Sân ngoài trời, trong nhà, giới thiệu, dịch vụ'],
  ['community', 'Mục cộng đồng', 'Lưới ảnh trên nền tối'],
  ['gallery', 'Dải ảnh chạy ngang', 'Khổ 3:2'],
  ['auth', 'Đăng nhập, đăng ký', 'Khổ dọc trên máy tính, khổ ngang trên điện thoại'],
  ['booking', 'Trang đặt sân', 'Banner ngang và thẻ gợi ý'],
];

export const SITE_MEDIA = {
  'hero.1': item('Slide 1', 'san-xanh', 'Hai người chơi trên hàng sân Pickleball ngoài trời', 50, 62),
  'hero.2': item('Slide 2', 'san-nui', 'Sân Pickleball ngoài trời với núi xanh phía sau', 50, 70),
  'hero.3': item('Slide 3', 'cham-vot', 'Hai người chơi chạm vợt qua lưới', 62, 30),
  'hero.4': item('Slide 4', 'tran-doi-xanh', 'Trận đánh đôi trên sân xanh', 50, 55),
  'hero.5': item('Slide 5', 'ban-be-ra-san', 'Nhóm bạn cười đùa trên sân Pickleball', 55, 30),

  'section.outdoor': item('Sân ngoài trời, ảnh lớn', 'san-nui', 'Sân Pickleball ngoài trời giữa núi xanh', 50, 78),
  'section.outdoor-2': item('Sân ngoài trời, ảnh nhỏ', 'san-xanh', 'Hàng sân ngoài trời màu xanh', 50, 62),
  'section.indoor': item('Sân trong nhà', 'san-trong-nha', 'Người chơi cầm vợt trên sân trong nhà', 50, 22),
  'section.intro': item('Giới thiệu Pickleball', 'tran-doi-xanh', 'Trận đánh đôi Pickleball trên sân xanh', 50, 55),
  'section.services': item('Dịch vụ tại sân', 'vot-va-nuoc', 'Vợt, bóng, khăn và nước uống trên sân', 50, 55),
  'section.break': item('Nghỉ giữa trận', 'nghi-giua-tran', 'Hai người chơi nghỉ uống nước trên sân', 50, 45),

  'community.1': item('Ô dọc lớn', 'vung-vot', 'Người chơi vung vợt bên lưới', 50, 22),
  'community.2': item('Ô 2', 'hai-ban-nu', 'Hai người bạn cầm vợt trên sân', 50, 25),
  'community.3': item('Ô 3', 'cu-danh-thuan', 'Người chơi thực hiện cú đánh thuận tay', 55, 40),
  'community.4': item('Ô 4', 'san-hong', 'Người chơi cầm vợt và bóng trên sân', 50, 18),
  'community.5': item('Ô 5', 'giao-bong-can-canh', 'Người chơi đánh bóng cận cảnh', 50, 40),

  'gallery.1': item('Ảnh 1', 'san-xanh', 'Hàng sân ngoài trời màu xanh', 50, 62),
  'gallery.2': item('Ảnh 2', 'cham-vot', 'Hai người chơi chạm vợt qua lưới', 55, 30),
  'gallery.3': item('Ảnh 3', 'dung-cu', 'Vợt và bóng Pickleball trên lưới', 50, 50),
  'gallery.4': item('Ảnh 4', 'tran-doi', 'Trận đánh đôi ngoài trời', 50, 55),
  'gallery.5': item('Ảnh 5', 'vay-xanh-chuoi', 'Người chơi đứng bên lưới', 50, 25),
  'gallery.6': item('Ảnh 6', 'vot-bong', 'Các mẫu vợt và bóng Pickleball', 50, 50),
  'gallery.7': item('Ảnh 7', 'san-nui', 'Sân ngoài trời giữa núi', 50, 75),
  'gallery.8': item('Ảnh 8', 'nghi-giua-tran', 'Hai người chơi nghỉ uống nước', 50, 45),
  'gallery.9': item('Ảnh 9', 'doi-cong', 'Hai người chơi phối hợp sát lưới', 50, 40),
  'gallery.10': item('Ảnh 10', 'tran-doi-xanh', 'Trận đánh đôi trên sân xanh', 50, 55),
  'gallery.11': item('Ảnh 11', 'cau-thu-trang', 'Người chơi đi trên sân', 50, 33),
  'gallery.12': item('Ảnh 12', 'doi-ban-tren-san', 'Đôi bạn đi dạo trên sân sau trận', 50, 40),

  'auth.login.1': item('Đăng nhập 1', 'vung-vot', 'Người chơi vung vợt bên lưới', 50, 18),
  'auth.login.2': item('Đăng nhập 2', 'san-trong-nha', 'Người chơi trên sân trong nhà', 50, 22),
  'auth.login.3': item('Đăng nhập 3', 'san-xanh', 'Hàng sân ngoài trời màu xanh', 50, 62),
  'auth.register.1': item('Đăng ký 1', 'hai-ban-nu', 'Hai người bạn cầm vợt trên sân', 50, 25),
  'auth.register.2': item('Đăng ký 2', 'tran-doi-xanh', 'Trận đánh đôi trên sân xanh', 50, 55),
  'auth.register.3': item('Đăng ký 3', 'vay-xanh-chuoi', 'Người chơi đứng bên lưới', 50, 25),
  'auth.password': item('Đổi mật khẩu', 'san-nui', 'Sân ngoài trời giữa núi', 50, 75),

  'booking.banner.1': item('Banner 1', 'hai-ban-nu', 'Hai người bạn cầm vợt trên sân', 50, 22),
  'booking.banner.2': item('Banner 2', 'san-xanh', 'Hàng sân ngoài trời màu xanh', 50, 62),
  'booking.banner.3': item('Banner 3', 'san-trong-nha', 'Người chơi trên sân trong nhà', 50, 22),
  'booking.banner.4': item('Banner 4', 'tran-doi-xanh', 'Trận đánh đôi trên sân xanh', 50, 55),
  'booking.banner.5': item('Banner 5', 'san-hong', 'Người chơi cầm vợt và bóng trên sân', 50, 18),
  'booking.tip.1': item('Gợi ý: rủ bạn', 'cham-vot', 'Hai người chơi chạm vợt qua lưới', 60, 30),
  'booking.tip.2': item('Gợi ý: thuê vợt', 'vot-va-nuoc', 'Vợt, bóng và nước uống', 50, 55),
  'booking.tip.3': item('Gợi ý: vào sân', 'nghi-giua-tran', 'Hai người chơi nghỉ trên sân', 50, 45),
};
