const VIETNAMESE_VALIDATION_MESSAGES: Readonly<Record<string, string>> = {
  arrayMaxSize: 'Danh sách vượt quá số lượng phần tử cho phép.',
  arrayMinSize: 'Danh sách chưa đủ số lượng phần tử tối thiểu.',
  arrayNotEmpty: 'Danh sách không được để trống.',
  isArray: 'Giá trị phải là danh sách.',
  isBoolean: 'Giá trị phải là true hoặc false.',
  isDateString: 'Ngày giờ không hợp lệ.',
  isDefined: 'Trường này là bắt buộc.',
  isEmail: 'Email không hợp lệ.',
  isEmpty: 'Trường này không được phép có giá trị.',
  isIn: 'Giá trị không hợp lệ.',
  isInt: 'Giá trị phải là số nguyên.',
  isLength: 'Độ dài giá trị không hợp lệ.',
  isNotEmpty: 'Trường này không được để trống.',
  isNumber: 'Giá trị phải là số hợp lệ.',
  isObject: 'Giá trị phải là đối tượng.',
  isString: 'Giá trị phải là chuỗi ký tự.',
  isUrl: 'Liên kết không hợp lệ.',
  isUuid: 'Mã định danh không hợp lệ.',
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
