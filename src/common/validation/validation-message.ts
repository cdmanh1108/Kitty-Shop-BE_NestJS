const VIETNAMESE_VALIDATION_MESSAGES: Readonly<Record<string, string>> = {
  arrayMaxSize: 'Danh sách có quá nhiều mục. Vui lòng giảm bớt.',
  arrayMinSize: 'Vui lòng chọn thêm mục để tiếp tục.',
  arrayNotEmpty: 'Danh sách không được để trống.',
  isArray: 'Giá trị phải là danh sách.',
  isBoolean: 'Vui lòng chọn lại tùy chọn này.',
  isDateString: 'Ngày giờ không hợp lệ.',
  isDefined: 'Trường này là bắt buộc.',
  isEmail: 'Email không hợp lệ.',
  isEmpty: 'Trường này không được phép có giá trị.',
  isIn: 'Giá trị không hợp lệ.',
  isInt: 'Giá trị phải là số nguyên.',
  isLength: 'Độ dài giá trị không hợp lệ.',
  isNotEmpty: 'Trường này không được để trống.',
  isNumber: 'Giá trị phải là số hợp lệ.',
  isObject: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.',
  isString: 'Thông tin nhập chưa hợp lệ.',
  isUrl: 'Liên kết không hợp lệ.',
  isUuid: 'Lựa chọn không hợp lệ. Vui lòng chọn lại.',
  length: 'Độ dài giá trị không hợp lệ.',
  matches: 'Giá trị không đúng định dạng.',
  max: 'Giá trị vượt quá giới hạn cho phép.',
  maxLength: 'Giá trị vượt quá số ký tự cho phép.',
  min: 'Giá trị nhỏ hơn giới hạn cho phép.',
  minLength: 'Giá trị chưa đủ số ký tự tối thiểu.',
  nestedValidation: 'Dữ liệu gửi lên không hợp lệ.',
};

const VIETNAMESE_CHARACTERS = /[À-ỹĐđ]/u;

export function vietnameseValidationMessage(constraint: string, message: string): string {
  if (VIETNAMESE_CHARACTERS.test(message)) return message;
  return VIETNAMESE_VALIDATION_MESSAGES[constraint] ?? 'Dữ liệu gửi lên không hợp lệ.';
}
